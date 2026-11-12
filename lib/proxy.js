const httpProxy = require("httpxy");
const http = require("http");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const { Readable } = require("stream");
const log4js = require("log4js");
const logger = log4js.getLogger("pro-xy");

const CONSTS = require("./consts");

let httpServer;
let config = loadConfig();

if (!fs.existsSync(path.dirname(CONSTS.LOG_FILE))) {
	fs.mkdirSync(path.dirname(CONSTS.LOG_FILE));
}
log4js.configure({
	appenders: {
		console: { type: "console" },
		file: { type: "file", filename: CONSTS.LOG_FILE }
	},
	categories: {
		default: { appenders: ["console", "file"], level: config.logLevel || "INFO" }
	}
});

const requiredVersion = require("../package.json").engines.node;

if (!require("semver").satisfies(process.version, requiredVersion)) {
	const msg = `Required node version ${requiredVersion} not satisfied (current version ${process.version})`;
	logger.error(msg);
	process.stderr.write(msg);
	process.exit(1);
}

logger.info("Starting with config", JSON.stringify(config, null, "\t"));
logger.debug(`Current node version: ${process.version}; Required node version ${requiredVersion}`);

const proxy = module.exports = Object.assign(new EventEmitter(), {
	start,
	stop,
	setConfig,
	getConfig
});

proxy.setConfig(config, true);
const plugins = loadPlugins(config);


function start() {
	const proxyServer = httpProxy.createProxyServer({ ignorePath: true, secure: false });
	proxyServer.on("error", (e, req, res) => {
		logger.error(e.message);
		if (res && !res.headersSent) {
			res.statusCode = 502;
			res.end(Buffer.from(e.message, 'utf-8'));
		}
	});
	if (httpServer) {
		stop();
	}
	httpServer = http.createServer(async function(req, res) {
		try {
			let bodyReplay;
			let bodyChunks;
			if (hasRequestBody(req)) {
				// Body-bearing requests are buffered before plugins run: plugins may
				// drain the request stream (e.g. pro-xy-ws-api taps data/end events),
				// which would leave nothing for the pipe to the target request.
				bodyChunks = await readRequestBody(req);
				bodyReplay = createBodyReplay(req, bodyChunks);
			}
			let endProcessing = false;
			for (const plugin of plugins) {
				if (endProcessing) {
					break;
				}
				logger.trace(`Plugin '${plugin.pluginName}' executing`);
				endProcessing = await Promise.resolve(plugin(config, req, res));
				logger.trace(`Plugin '${plugin.pluginName}' execution done with result (end processing) ${endProcessing}`);
			}
			if (bodyChunks) {
				// Plugins may have attached data/end listeners to req during exec();
				// the original stream is already consumed, so feed them the buffered body.
				for (const chunk of bodyChunks) {
					req.emit("data", chunk);
				}
				req.emit("end");
			}
			if (!endProcessing) {
				if (bodyReplay) {
					// plugins may have replaced method/url/headers on the original req - keep the replay in sync
					bodyReplay.method = req.method;
					bodyReplay.url = req.url;
					bodyReplay.headers = req.headers;
				}
				proxyServer.web(bodyReplay || req, res, { target: req.url }, handleError);
			}
		} catch(e) {
			handleError(e);
		}

		function handleError(e) {
			logger.error(e.message);
			res.statusCode = 502;
			res.end(Buffer.from(e.message, 'utf-8'));
		}
	});
	httpServer.listen(config.port);
	logger.info("Proxy server started on port", config.port);
	proxy.emit("serverstarted", httpServer, proxyServer);
}

function stop() {
	proxy.emit("serverstop", httpServer);
	httpServer.close();
	proxy.emit("serverstopped", httpServer);
	httpServer = null;
	logger.info("Proxy server stopped.");
}

function loadConfig() {
	if (!fs.existsSync(CONSTS.CONFIG_LOCATION)) {
		fs.writeFileSync(CONSTS.CONFIG_LOCATION, "{}");
		return {};
	}

	return require(CONSTS.CONFIG_LOCATION);
}

function setConfig(newConfig, noWrite) {
	newConfig = structuredClone(newConfig);

	log4js.configure({
		appenders: {
			console: { type: "console" },
			file: { type: "file", filename: CONSTS.LOG_FILE }
		},
		categories: {
			default: { appenders: ["console", "file"], level: newConfig.logLevel || "INFO" }
		}
	});
	logger.debug("Setting config", newConfig);
	const oldPort = config && config.port;

	config = Object.assign({
		port: CONSTS.DEFAULT_PORT
	}, newConfig);

	if (!noWrite) {
		fs.writeFileSync(CONSTS.CONFIG_LOCATION, JSON.stringify(config, null, "\t"));
		logger.debug(`Config written to ${CONSTS.CONFIG_LOCATION}`);
	}

	proxy.emit("configupdated", config);

	if (oldPort && oldPort != config.port) { //only if port has chaged we need to restart
		logger.info(`Restarting due to port change from ${oldPort} to ${config.port}`);
		proxy.stop();
		proxy.start();
	}
	logger.trace("Config set done");
}

function getConfig() {
	return structuredClone(config);
}

function loadPlugins(config) {
	return (config.plugins || [])
	.map(plugin => {
		logger.debug(`Loading plugin "${plugin}"`);
		const pluginModule = require(plugin);
		if (pluginModule.init) {
			logger.debug(`Initializing plugin "${plugin}"`);
			// inject also logger
			// there is problem with configuration if modules have own instalation of log4js
			pluginModule.init(proxy, log4js.getLogger(plugin));
		}
		logger.info(`Initialized plugin "${plugin}"`);
		const exec = pluginModule.exec || (typeof pluginModule == "function" ? pluginModule : null);
		exec && (exec.pluginName = plugin);
		return exec;
	})
	.filter(execFn => !!execFn);
}

////// REQUEST BODY HANDLING

function hasRequestBody(req) {
	const contentLength = parseInt(req.headers["content-length"], 10);
	if (Number.isFinite(contentLength) && contentLength > 0) {
		return true;
	}
	const transferEncoding = req.headers["transfer-encoding"];
	return !!transferEncoding && transferEncoding.toLowerCase().includes("chunked");
}

async function readRequestBody(req) {
	const chunks = [];
	for await (const chunk of req) {
		chunks.push(chunk);
	}
	return chunks;
}

function createBodyReplay(req, chunks) {
	const replay = new Readable({ read() {} });
	replay.push(Buffer.concat(chunks));
	replay.push(null);
	// Present the replay as the original request for httpxy; headers stay shared
	// by reference so header edits made by plugins remain effective. The caller
	// syncs method/url/headers before proxying in case plugins changed them.
	replay.url = req.url;
	replay.method = req.method;
	replay.headers = req.headers;
	replay.rawHeaders = req.rawHeaders;
	replay.httpVersion = req.httpVersion;
	replay.httpVersionMajor = req.httpVersionMajor;
	replay.httpVersionMinor = req.httpVersionMinor;
	replay.socket = req.socket;
	replay.connection = req.connection;
	return replay;
}

////// EXIT HANDLER
//http://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits

process.stdin.resume();//so the program will not close instantly

function exitHandler(options, err) {
	options.log && logger.info(`Exit handler for '${options.evt}'; ${err && err.stack || ""} `);
	if (err) { //use stderr - beacasue console.err is redirected to stdOut due to log4js
		process.stderr.write(`Unhandled error:`);
		process.stderr.write(err.stack);
	}
	if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {
	evt: "exit",
	log: false,
	cleanup: true
}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {
	evt: "SIGINT",
	log: true,
	exit: true
}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {
	evt: "uncaughtException",
	log: true,
	exit: true
}));
