'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var BattleRoomClient = require('./client');
var BattleRoomServer = require('./server');

module.exports = function () {
  function BattleRoomMaster(config, firebaseInst) {
    _classCallCheck(this, BattleRoomMaster);

    this.firebase = firebaseInst;
    this.config = config;
    this.ref = this.firebase.database().ref(this.config.path || 'battles');
    this.client = null;
    this.server = null;
    this.handlers = [];
    this.battleReady = false;
    this.config.size = this.config.size || 2;
    this.config.MAX_CLIENT_WAIT_TIME = this.config.MAX_CLIENT_WAIT_TIME || 3000;
    this.config.MAX_INVITE_WAIT_TIME = this.config.MAX_INVITE_WAIT_TIME || 3000;
    this.config.messages = Object.assign({
      searching: 'searching',
      joining: 'joining',
      accepted: 'accepted',
      ready: 'ready'
    }, this.config.messages || {});
  }

  _createClass(BattleRoomMaster, [{
    key: 'destroy',
    value: function destroy() {
      if (this.client) {
        this.client.destroy();
        this.client = null;
      }
      if (this.server) {
        this.server.destroy();
        this.server = null;
      }
    }
  }, {
    key: 'registerHandler',
    value: function registerHandler(callback, context) {
      var index = -1;
      this.handlers.map(function (handler, i) {
        if (handler.callback === callback && handler.context === context) {
          index = i;
        }
      });
      if (index === -1) {
        this.handlers.push({
          callback: callback,
          context: context
        });
      }
    }
  }, {
    key: 'unregisterHandler',
    value: function unregisterHandler(callback, context) {
      var index = -1;
      this.handlers.map(function (handler, i) {
        if (handler.callback === callback && handler.context === context) {
          index = i;
        }
      });
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    }
  }, {
    key: 'notify',
    value: function notify(msg) {
      for (var i = 0; i < this.handlers.length; i++) {
        this.handlers[i].callback.call(this.handlers[i].context, {
          notification: msg
        });
      }
    }
  }, {
    key: 'error',
    value: function error(msg, _error) {
      for (var i = 0; i < this.handlers.length; i++) {
        this.handlers[i].callback.call(this.handlers[i].context, {
          notification: msg,
          error: _error
        });
      }
    }
  }, {
    key: 'ready',
    value: function ready(msg) {
      this.battleReady = true;
      for (var i = 0; i < this.handlers.length; i++) {
        this.handlers[i].callback.call(this.handlers[i].context, {
          notification: msg,
          ready: true
        });
      }
    }
  }, {
    key: 'prepareForBattle',
    value: function prepareForBattle() {
      var _this = this;

      if (!this.firebase.auth().currentUser) {
        this.firebase.auth().signInAnonymously().then(function () {
          _this._prepareForBattle();
        });
      } else {
        this._prepareForBattle();
      }
    }
  }, {
    key: '_prepareForBattle',
    value: function _prepareForBattle() {
      var _this2 = this;

      this.destroy();

      // check if owner of any existing servers
      this.server = new BattleRoomServer(this, this.config);
      this.server.resume().catch(function () {
        // no existing rooms for user
        _this2.server.destroy();
        _this2.server = null;

        // look for room as client
        _this2.client = new BattleRoomClient(_this2, _this2.config);
        _this2.client.start();

        // configure client to only wait 3 seconds for a game,
        // after that convert into being a server
        setTimeout(function () {
          if (_this2.client && !_this2.client.isInRoom()) {
            _this2.client.destroy();
            _this2.client = null;

            _this2.server = new BattleRoomServer(_this2, _this2.config);
            _this2.server.start();
          }
        }, _this2.config.MAX_CLIENT_WAIT_TIME);
      });
    }
  }, {
    key: 'acceptBattle',
    value: function acceptBattle() {
      if (this.client) {
        return this.client.accept();
      } else {
        return this.server.accept();
      }
    }
  }, {
    key: 'restart',
    value: function restart() {
      if (this.server) {
        this.getRoom().child('circles').remove();
      }
    }
  }, {
    key: 'unacceptBattle',
    value: function unacceptBattle() {
      if (this.client) {
        return this.client.unaccept();
      } else {
        return this.server.unaccept();
      }
    }
  }, {
    key: 'getRoom',
    value: function getRoom() {
      if (this.client) {
        return this.client.roomRef;
      } else {
        return this.server.roomRef;
      }
    }
  }, {
    key: 'getClients',
    value: function getClients() {
      if (this.client) {
        return this.client.clientsRef;
      } else {
        return this.server.clientsRef;
      }
    }
  }, {
    key: 'onServerDisconnect',
    value: function onServerDisconnect(callback) {
      this.getRoom().on('value', function (snapshot) {
        if (!snapshot.val()) {
          // room disconnected
          callback();
          return;
        }
      });
    }
  }, {
    key: 'onClientDisconnect',
    value: function onClientDisconnect(callback) {
      this.getClients().on('child_removed', function () {
        callback();
      });
    }
  }]);

  return BattleRoomMaster;
}();