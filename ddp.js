#!/usr/bin/env node

// exit codes
var SUCCESS = 0;
var USAGE_ERROR = 1;
var CONNECTION_ERROR = 2;
var METHOD_ERROR = 3;
var SUBSCRIPTION_ERROR = 4;

var DDPClient = require('ddp');
var util = require('util');
var _ = require('underscore');

var Client = function (onConnect, opts) {
  if (!(this instanceof Client))
    return new Client(onConnect, opts);

  opts = opts || {};
  DDPClient.prototype.constructor.call(this, opts);
  this.setup(onConnect);
};

var data = {};

var debug = function() {
  // console.log(arguments)
}

util.inherits(Client, DDPClient);

_.extend(Client.prototype, {
  close: function () {
    console.log('');
    console.log('Closing DDP connection');
    DDPClient.prototype.close.call(this);
  },

  setup: function (onConnect) {
    var client = this;

    this.connect(function (err) {
      if (err) {
        console.log('Connection error: ', err);
        process.exit(CONNECTION_ERROR);
      }

      return onConnect.call(this);
    });

    this.on('message', function (msg) {
      debug('[msg]: ' + msg);
      
      var msg = JSON.parse(msg);
      if (msg.msg === 'added') {
        data[msg.collection] = data[msg.collection] || {};
        data[msg.collection][msg.id] = msg.fields;
      }
    });

    this.on('socket-close', function (code, message) {
      debug('[socket closed]: ', code, message);
      process.exit(CONNECTION_ERROR);
    });

    this.on('socket-error', function (error) {
      console.error('[socket error]: ', error && error.toString());
      process.exit(CONNECTION_ERROR);
    });

    process.on('SIGINT', function () {
      client.close();
    });
  },

  parseArgs: function (args) {
    var client = this
    args = args.map(function (arg) {
      try {
        return JSON.parse(arg);
      } catch (e) {
        return arg;
      }
    });

    return args;
  }
});

var commands = {
  "connect": {
    usage: function () {
     console.error('Connect to a DDP server');
     console.error('Usage: ddp connect');
     process.exit(USAGE_ERROR);
    },

    run: function (args, opts) {
      Client(function () {
        console.log('[connected]');
        process.exit(SUCCESS);
      }, opts);
    }
  },

  "call": {
    usage: function () {
     console.error('Call a Meteor method');
     console.error('Usage: ddp call <method> [<param1> <param2> ...]');
     process.exit(USAGE_ERROR);
    },

    run: function (args, opts) {
      var method;
      var methodArgs = args.slice(1);

      if (!(method = args[0])) return this.usage();

      Client(function () {
        var client = this;
        methodArgs = this.parseArgs(methodArgs);
        debug('[call]: ' + method + ' ' + JSON.stringify(methodArgs));
        this.call(method, methodArgs, function (err, res) {
          if (err) {
            console.log(JSON.stringify(err));
            process.exit(METHOD_ERROR);
          } else {
            console.log(JSON.stringify(res));
            process.exit(SUCCESS);
          }
        });
      }, opts);
    }
  },

  "subscribe": {
    usage: function () {
     console.error('Subscribe to a Meteor Collection');
     console.error('Usage: ddp subscribe <subscription> [<param1> <param2> ...]');
     process.exit(USAGE_ERROR);
    },

    run: function (args, opts) {
      var subscription;
      var subscriptionArgs = args.slice(1);


      if (!(subscription = args[0])) return this.usage();

      Client(function () {
        subscriptionArgs = this.parseArgs(subscriptionArgs);
        debug('[subscribe]: ' + subscription + ' ' + JSON.stringify(subscriptionArgs));
        this.subscribe(subscription, subscriptionArgs, function(err) {
          if (err) {
            console.log(JSON.stringify(err));
            process.exit(SUBSCRIPTION_ERROR);
          } else {
            // dump all data
            console.log(JSON.stringify(data));
            process.exit(SUCCESS);
          }
        });
      }, opts);
    }
  },

  "subscribe-multi": {
    usage: function () {
     console.error('Subscribe to multiple Meteor Collections');
     console.error('Usage: ddp subscribe-multi <subscription> [<subscription2> <subscription3> ...]');
     process.exit(USAGE_ERROR);
    },

    run: function (args, opts) {
      var subscriptions = args;

      if (!subscriptions.length) return this.usage();

      Client(function () {
        var complete = 0;
        for (var i = 0; i < subscriptions.length; i++) {
          debug('[subscribe]: ' + subscriptions[i]);
          this.subscribe(subscriptions[i], [], function(err) {
            if (err) {
              console.log(JSON.stringify(err));
              process.exit(SUBSCRIPTION_ERROR);
            } else {
              complete += 1;
              if (complete === subscriptions.length) {
                // dump all data
                console.log(JSON.stringify(data));
                process.exit(SUCCESS);
              }
            }
            
          });
        }
      });
    }
  }
};

var argv = require('optimist')
  .default({
    host: 'localhost',
    port: 3000,
    path: 'websocket',
    auto_reconnect: false,
    use_ssl: false,
    auto_reconnect_timer: 500
  }).argv

var args = argv._;
var commandName = args[0];
var commandArgs = args.slice(1);
var command;

// get the rest of the args, removing the command name
args = args.slice(1);

var usage = function () {
  console.error('Command line tools for DDP.\n');
  console.error('Usage: ddp [--host] [--port] [--path] [--auto_reconnect] [--use_ssl] [--auto_reconnect_timer] <command> [<args>]\n');
  console.error('Available commands are:');
  console.error('\tconnect\t\t\tConnect to a DDP server');
  console.error('\tsubscribe\t\tSubscribe to a collection with parameters');
  console.error('\tsubscribe-multi\t\tSubscribe to multiple collections');
  console.error('\tcall\t\t\tCall a method');
  process.exit(SUCCESS);
}

if (!commandName) 
  return usage();

if (!(command = commands[commandName]))
  return usage();

try {
  command.run.call(command, args, argv);
} catch (e) {
  console.error('Error running command: ' + e.toString());
  this.usage();
  system.exit(SUCCESS);
}
