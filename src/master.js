const BattleRoomClient = require('./client');
const BattleRoomServer = require('./server');

module.exports = class BattleRoomMaster {
  constructor(config, firebaseInst) {
    this.firebase = firebaseInst;
    this.ref = this.firebase.database().ref('battles');
    this.client = null;
    this.server = null;
    this.handlers = [];
    this.battleReady = false;
    this.config = config;
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

  destroy() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    if (this.server) {
      this.server.destroy();
      this.server = null;
    }
  }

  registerHandler(callback, context) {
    let index = -1;
    this.handlers.map((handler, i) => {
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

  unregisterHandler(callback, context) {
    let index = -1;
    this.handlers.map((handler, i) => {
      if (handler.callback === callback && handler.context === context) {
        index = i;
      }
    });
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  notify(msg) {
    for (let i = 0; i < this.handlers.length; i++) {
      this.handlers[i].callback.call(this.handlers[i].context, {
        notification: msg
      });
    }
  }

  error(msg, error) {
    for (let i = 0; i < this.handlers.length; i++) {
      this.handlers[i].callback.call(this.handlers[i].context, {
        notification: msg,
        error: error
      });
    }
  }

  ready(msg) {
    this.battleReady = true;
    for (let i = 0; i < this.handlers.length; i++) {
      this.handlers[i].callback.call(this.handlers[i].context, {
        notification: msg,
        ready: true
      });
    }
  }

  prepareForBattle() {
    if (!this.firebase.auth().currentUser) {
      this.firebase.auth().signInAnonymously().finally(() => {
        this._prepareForBattle();
      });
    } else {
      this._prepareForBattle();
    }
  }

  _prepareForBattle() {
    this.destroy();

    // check if owner of any existing servers
    this.server = new BattleRoomServer(this, this.config);
    this.server.resume().catch(() => {
      // no existing rooms for user
      this.server.destroy();
      this.server = null;

      // look for room as client
      this.client = new BattleRoomClient(this, this.config);
      this.client.start();

      // configure client to only wait 3 seconds for a game,
      // after that convert into being a server
      setTimeout(() => {
        if (this.client && !this.client.isInRoom()) {
          this.client.destroy();
          this.client = null;

          this.server = new BattleRoomServer(this, this.config);
          this.server.start();
        }
      }, this.config.MAX_CLIENT_WAIT_TIME);
    });
  }

  acceptBattle() {
    if (this.client) {
      return this.client.accept();
    } else {
      return this.server.accept();
    }
  }

  restart() {
    if (this.server) {
      this.getRoom().child('circles').remove();
    }
  }

  unacceptBattle() {
    if (this.client) {
      return this.client.unaccept();
    } else {
      return this.server.unaccept();
    }
  }

  getRoom() {
    if (this.client) {
      return this.client.roomRef;
    } else {
      return this.server.roomRef;
    }
  }

  getClients() {
    if (this.client) {
      return this.client.clientsRef;
    } else {
      return this.server.clientsRef;
    }
  }

  onServerDisconnect(callback) {
    this.getRoom().on('value', (snapshot) => {
      if (!snapshot.val()) {
        // room disconnected
        callback();
        return;
      }
    });
  }

  onClientDisconnect(callback) {
    this.getClients().on('child_removed', () => {
      callback();
    });
  }
}
