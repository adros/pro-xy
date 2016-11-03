var httpProxy = require("http-proxy");
var http = require("http");
var fs = require("fs");
var path = require("path");
var EventEmitter = require("events");

var CONFIG_LOCATION = path.join(process.env.HOME, ".proxyrc.json");
var DEFAULT_PORT = 8000;

var httpServer, config;

var proxy = module.exports = Object.assign(new EventEmitter(), {
	start: startProxy,
	stop: stopProxy,
	setConfig: setConfig,
	getConfig: getConfig
});

proxy.setConfig(loadConfig(), true);
var plugins = loadPlugins(config);

function startProxy() {
	var proxyServer = httpProxy.createProxyServer({});
	if (httpServer) {
		stopProxy();
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
			console.error(e.message);
			res.status = 502;
			res.end(e.message);
		});
	});
	httpServer.listen(config.port);
	console.log("Proxy server started on port", config.port);
	proxy.emit("serverstarted", httpServer, proxyServer);
}

function stopProxy() {
	httpServer.close();
	proxy.emit("serverstopped", httpServer);
	httpServer = null;
	console.log("Proxy server stopped.");
}

function loadConfig() {
	if (!fs.existsSync(CONFIG_LOCATION)) {
		fs.writeFileSync(CONFIG_LOCATION, "{}");
		return {};
	}

	return JSON.parse(fs.readFileSync(CONFIG_LOCATION, "utf-8"));
}

function setConfig(newConfig, noWrite) {
	var oldPort = config && config.port;

	config = Object.assign({
		port: DEFAULT_PORT
	}, newConfig);

	if (!noWrite) {
		fs.writeFileSync(CONFIG_LOCATION, JSON.stringify(newConfig, null, "\t"));
	}

	proxy.emit("configupdated", config);

	if (oldPort && oldPort != config.port) { //only if port has chaged we need to restart
		proxy.stop();
		proxy.start();
	}
}

function getConfig() {
	return config;
}

function loadPlugins(config) {
	return (config.plugins || [])
	.map(plugin => {
		console.log(`Loading plugin "${plugin}"`);
		var pluginModule = require(plugin);
		if (pluginModule.init) {
			pluginModule.init(proxy);
		}
		return pluginModule.exec || (typeof pluginModule == "function" ? pluginModule : null);
	})
	.filter(execFn => !!execFn);
}
