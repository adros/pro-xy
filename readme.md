# pro-xy

Simple pluggable http proxy, which allows to define plugins, that can change request or response.

## Usage

1. Install

		npm install -g pro-xy

2. Run.

		pro-xy

Alternatively pro-xy can also be required from another module and launched be calling *start* method.

## Config file

Sample:

```
{
	"port": 8000,
	"logLevel": "DEBUG",
	"plugins": [
		"pro-xy-url-replace",
		"pro-xy-header-replace",
		"pro-xy-cookie-replace",
		"pro-xy-auto-responder"
	],
	"pro-xy-url-replace": {
		"disabled": false,
		"replaces": [],
		"replaceBackHeaders": [
			"location",
			"link"
		]
	},
	"pro-xy-auto-responder": {
		"disabled": true,
		"responses": []
	},
	"pro-xy-cookie-replace" : {
		"disabled": true,
		"replaces": []
	},
	"pro-xy-header-replace":{
		"disabled": true,
		"replaces": []
	}
}
```

This sample file defines port to start on, logging configuration and 4 plugins and their configuration.

- *port* - port for proxy
- *plugins* - list of plugins to use. Plugins are represented by name of their npm package and must be installed alongside pro-xy module

## Plugins

Plugins are npm modules which export function that will be called for each request and will receive *config*, *request* and *response*. If function truthy value, it means it has processed the request completely and no following plugins and replaces will be applied.

	module.exports = function(config, req, res) {
		//do something
		return false;
	};

Instead of function plugin may export object with two methods *init* and *exec*, where exec should be same function as defined above and exec should be a function which will be called on pro-xy startup and will receive *pro-xy* instance an *log4js* logger instance for this pluggin,

	var logger;
	module.exports = {
		init: function (_proxy, _logger) {
			logger = _logger;
		},
		exec: function(config, req, res) {
			//do something
			//logger.trace(...)
			return false;
		}
	};


## Known plugins

- [pro-xy-url-replace](https://github.com/adros/pro-xy-url-replace)
- [pro-xy-header-replace](https://github.com/adros/pro-xy-header-replace)
- [pro-xy-cookie-replace](https://github.com/adros/pro-xy-cookie-replace)
- [pro-xy-auto-responder](https://github.com/adros/pro-xy-auto-responder)
