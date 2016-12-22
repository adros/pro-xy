var httpProxy = require("http-proxy");
var http = require("http");
var fs = require("fs");
var path = require("path");
var EventEmitter = require("events");
var Promise = require("bluebird");
var _ = require("lodash");
var log4js = require("log4js");
var logger = log4js.getLogger("pro-xy");

var CONSTS = require("./consts");

var httpServer;
var config = loadConfig();

if (!fs.existsSync(path.dirname(CONSTS.LOG_FILE))) {
	fs.mkdirSync(path.dirname(CONSTS.LOG_FILE));
}
log4js.configure({
	appenders: [
		{
			type: "console"
		},
		{
			type: "file",
			filename: CONSTS.LOG_FILE
		}
	]
});
log4js.setGlobalLogLevel(config.logLevel || "INFO");

var requiredVersion = require("../package.json").engines.node;

if (!require("semver").satisfies(process.version, requiredVersion)) {
	var msg = `Required node version ${requiredVersion} not satisfied (current version ${process.version})`;
	logger.error(msg);
	process.stderr.write(msg);
	process.exit(1);
}

logger.info("Starting with config", JSON.stringify(config, null, "\t"));
logger.debug(`Current node version: ${process.version}; Required node version ${requiredVersion}`);

var proxy = module.exports = Object.assign(new EventEmitter(), {
	start,
	stop,
	setConfig,
	getConfig
});

proxy.setConfig(config, true);
var plugins = loadPlugins(config);


function start() {
	var proxyServer = httpProxy.createProxyServer({});
	if (httpServer) {
		stop();
	}
	httpServer = http.createServer(function(req, res) {
		Promise.reduce(plugins, (endProcessing, plugin) => {
			if (endProcessing) {
				return true;
			}
			logger.trace(`Plugin '${plugin.pluginName}' executing`);
			return Promise.resolve(plugin(config, req, res))//
			.then(_endProcessing => {
				logger.trace(`Plugin '${plugin.pluginName}' execution done with result (end processing) ${_endProcessing}`);
				return _endProcessing;
			});
		}, false)
		.then((endProcessing) => {
			if (endProcessing) {
				return;
			}
			proxyServer.web(req, res, {
				target: req.url,
				//WARNING! toProxy and prependPath options are used to avoid url.parse
				//used by http-proxy, because it would escape some characters, eg. |
				//https://github.com/nodejitsu/node-http-proxy/issues/725
				//req.url on target server now returns full url instead of just path
				toProxy: true,
				prependPath: false
			}, handleError);
		})
		.catch(handleError);

		function handleError(e) {
			logger.error(e.message);
			res.statusCode = 502;
			res.end(e.message);
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
	newConfig = _.cloneDeep(newConfig);

	log4js.setGlobalLogLevel(newConfig.logLevel || "INFO");
	logger.debug("Setting config", newConfig);
	var oldPort = config && config.port;

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
	return _.cloneDeep(config);
}

function loadPlugins(config) {
	return (config.plugins || [])
	.map(plugin => {
		logger.debug(`Loading plugin "${plugin}"`);
		var pluginModule = require(plugin);
		if (pluginModule.init) {
			logger.debug(`Initializing plugin "${plugin}"`);
			// inject also logger
			// there is problem with configuration if modules have own instalation of log4js
			pluginModule.init(proxy, log4js.getLogger(plugin));
		}
		logger.info(`Initialized plugin "${plugin}"`);
		var exec = pluginModule.exec || (typeof pluginModule == "function" ? pluginModule : null);
		exec && (exec.pluginName = plugin);
		return exec;
	})
	.filter(execFn => !!execFn);
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
