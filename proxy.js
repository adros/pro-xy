var httpProxy = require("http-proxy");
var http = require("http");
var fs = require("fs");

var configLocations = [
	"./.proxyrc.json",
	process.env.HOME + "/.proxyrc.json"
];

var config = loadConfig();
var plugins = loadPlugins(config);
var server;

function startProxy(replaceName) {
	if (!config) {
		console.error("Config not found");
		process.exit(1);
	}
	var proxy = httpProxy.createProxyServer({});
	if (server) {
		stopProxy();
	}
	server = http.createServer(function(req, res) {
		var endProcessing = plugins.some(function(plugin) {
			return plugin(config, req, res); //if plugin returns true, it means it processed request, do not continue
		});
		if (endProcessing) {
			return;
		}
		(config.replaces || []).forEach(function(replace) {
			if (replaceName && replaceName == replace.name) {
				req.url = req.url.replace(new RegExp(replace.pattern), replace.replacement);
				return;
			}
			if (!replaceName && !replace.disabled) {
				req.url = req.url.replace(new RegExp(replace.pattern), replace.replacement);
			}
		});
		// console.log(req.url);
		proxy.web(req, res, {
			target: req.url,
			//WARNING! toProxy and prependPath options are used to avoid url.parse
			//used by http-proxy, because it would escape some characters, eg. |
			//https://github.com/nodejitsu/node-http-proxy/issues/725
			//req.url on target server now returns full url instead of just path, is this ok?
			toProxy: true,
			prependPath: false
		}, function(e) {
			console.error(e.message);
			res.status = 502;
			res.end(e.message);
		});
	});
	server.listen(config.port);
}

function loadConfig() {
	var config;
	configLocations.some(function(location) {
		if (fs.existsSync(location)) {
			config = JSON.parse(fs.readFileSync(location, "utf-8"));
			return true;
		}
	});
	if (!config) {
		console.error("Failed to load config");
		process.exit(1);
	}
	return config;
}

function stopProxy() {
	server.close();
	server = null;
}

function reloadConfig() {
	config = loadConfig();
}

function getConfig() {
	return config;
}

function loadPlugins(config) {
	return (config.plugins || []).map(function(plugin) {
		return require(plugin);
	});
}

module.exports = {
	startProxy: startProxy,
	stopProxy: stopProxy,
	reloadConfig: reloadConfig,
	getConfig: getConfig
};
