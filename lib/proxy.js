var httpProxy = require("http-proxy");
var http = require("http");
var fs = require("fs");
var path = require("path");
var EventEmitter = require("events");
var _ = require("lodash");
var log4js = require("log4js");
var logger = log4js.getLogger("pro-xy");

var CONSTS = require("./consts");

var httpServer;
var config = loadConfig();

logger.info("Starting with config", JSON.stringify(config, null, "\t"));

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
		var endProcessing = plugins.some(plugin => plugin(config, req, res));
		if (endProcessing) {
			return; //if plugin returns true, it means it processed request, do not continue
		}

		proxyServer.web(req, res, {
			target: req.url,
			//WARNING! toProxy and prependPath options are used to avoid url.parse
			//used by http-proxy, because it would escape some characters, eg. |
			//https://github.com/nodejitsu/node-http-proxy/issues/725
			//req.url on target server now returns full url instead of just path
			toProxy: true,
			prependPath: false
		}, function(e) {
			logger.error(e.message);
			res.status = 502;
			res.end(e.message);
		});
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
			pluginModule.init(proxy);
		}
		logger.info(`Initialized plugin "${plugin}"`);
		return pluginModule.exec || (typeof pluginModule == "function" ? pluginModule : null);
	})
	.filter(execFn => !!execFn);
}
