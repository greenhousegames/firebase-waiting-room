'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

module.exports = function () {
  function BattleRoomServer(master) {
    _classCallCheck(this, BattleRoomServer);

    this.clientsRef = null;
    this.roomRef = null;
    this.master = master;
    this._refs = [];
    this._uids = [];
  }

  _createClass(BattleRoomServer, [{
    key: 'accept',
    value: function accept() {
      var _this = this;

      var promise = new Promise(function (resolve, reject) {
        var startedRef = _this.roomRef.child('started');
        _this._refs.push(startedRef);
        startedRef.on('value', function (snapshot) {
          if (snapshot.val() === true) {
            startedRef.off('value');
            resolve();
          }
        });

        // wait for all clients to be ready
        _this.waitForAllClientsReady().then(function () {
          return startedRef.set(true);
        }).catch(reject);
      });
      return promise;
    }
  }, {
    key: 'unaccept',
    value: function unaccept() {
      var _this2 = this;

      var promise = new Promise(function (resolve, reject) {
        var startedRef = _this2.roomRef.child('started');
        _this2._refs.push(startedRef);
        startedRef.on('value', function (snapshot) {
          if (snapshot.val() === false) {
            startedRef.off('value');
            resolve();
          }
        });

        startedRef.set(false).catch(reject);
      });
      return promise;
    }
  }, {
    key: 'start',
    value: function start() {
      var _this3 = this;

      this.alloff();

      var promise = new Promise(function (resolve, reject) {
        _this3.createRoom().then(function () {
          _this3.waitInRoom().then(resolve).catch(reject);
        }).catch(function (error) {
          _this3.master.error('error creating battle', error);
          reject(error);
        });
      });
      return promise;
    }
  }, {
    key: 'resume',
    value: function resume() {
      var _this4 = this;

      this.alloff();

      var promise = new Promise(function (resolve, reject) {
        _this4.joinExisting().then(function (room) {
          if (!room.started) {
            // remove all clients and start over
            _this4.clientsRef.remove();
            _this4.waitInRoom().then(resolve).catch(reject);
          } else {
            // remove room and start over
            _this4.roomRef.remove();
            _this4.start().then(resolve).catch(reject);
          }
        }).catch(reject);
      });
      return promise;
    }
  }, {
    key: 'joinExisting',
    value: function joinExisting() {
      var _this5 = this;

      var query = this.master.ref.child('rooms').orderByChild('owner').startAt(this.master.firebase.auth().currentUser.uid).endAt(this.master.firebase.auth().currentUser.uid);
      this._refs.push(query);
      var promise = new Promise(function (resolve, reject) {
        query.once('value', function (snapshot) {
          var rooms = snapshot.val();
          if (rooms) {
            var roomKey = Object.keys(rooms)[0];
            var room = rooms[roomKey];
            _this5.joinRoom(roomKey);
            resolve(room);
          } else {
            reject();
          }
        }, _this5);
      });
      return promise;
    }
  }, {
    key: 'createRoom',
    value: function createRoom() {
      this.roomRef = this.master.ref.child('rooms').push();
      this.clientsRef = this.roomRef.child('clients');
      return this.roomRef.set({
        owner: this.master.firebase.auth().currentUser.uid,
        started: false,
        ready: false
      });
    }
  }, {
    key: 'joinRoom',
    value: function joinRoom(key) {
      this.roomRef = this.master.ref.child('rooms').child(key);
      this.clientsRef = this.roomRef.child('clients');
    }
  }, {
    key: 'waitInRoom',
    value: function waitInRoom() {
      var _this6 = this;

      this.master.notify(this.master.config.messages.searching);

      var promise = new Promise(function (resolve, reject) {
        _this6.waitForAllClients().then(function (uids) {
          _this6._uids = uids;
          _this6.master.notify(_this6.master.config.messages.accepted);

          // signal game to start
          _this6.roomRef.child('ready').set(true).then(function () {
            _this6.master.ready(_this6.master.config.messages.ready);
            resolve();
          }).catch(function (error) {
            _this6.master.error('error starting battle', error);
            reject(error);
          });
        }).catch(function (error) {
          _this6.master.error('error waiting for opponents', error);
          reject(error);
        });
      });
      return promise;
    }
  }, {
    key: 'sendInvite',
    value: function sendInvite() {
      var _this7 = this;

      var query = this.master.ref.child('waiting').orderByChild('invite').startAt(false).endAt(false);
      this._refs.push(query);
      var promise = new Promise(function (resolve, reject) {
        var roomId = _this7.roomRef.key;
        query.on('child_added', function (snapshot) {
          var uid = snapshot.key;
          var val = snapshot.val();
          if (val.size === _this7.master.config.size) {
            // send invite
            _this7.master.ref.child('waiting').child(uid).child('invite').set(roomId).then(function () {
              return resolve(uid);
            }).catch(reject);
          }
        }, _this7);
      });
      promise.then(function () {
        return query.off('child_added');
      }).catch(function () {
        return query.off('child_added');
      });
      return promise;
    }
  }, {
    key: 'waitForInviteResponse',
    value: function waitForInviteResponse(uid) {
      var _this8 = this;

      var joined = false;
      var clientRef = this.clientsRef.child(uid);
      this._refs.push(clientRef);
      var promise = new Promise(function (resolve, reject) {
        // wait for client
        clientRef.on('value', function (snapshot) {
          var record = snapshot.val();
          if (record && record.allowed === false) {
            // client joined
            joined = true;
            clientRef.child('allowed').set(true).then(resolve).catch(reject);
          }
        });

        // wait at max 3 seconds for invite response
        setTimeout(function () {
          if (!joined) {
            reject();
          }
        }, _this8.master.config.MAX_INVITE_WAIT_TIME);
      });
      promise.then(function () {
        return clientRef.off('value');
      }).catch(function () {
        return clientRef.off('value');
      });
      return promise;
    }
  }, {
    key: 'waitForClient',
    value: function waitForClient() {
      var _this9 = this;

      var promise = new Promise(function (resolve, reject) {
        _this9.sendInvite().then(function (uid) {
          _this9.waitForInviteResponse(uid)
          // client confirmed
          .then(function () {
            console.log('client joined: ' + uid);
            resolve(uid);
          })
          // client rejected, start over
          .catch(function () {
            return _this9.waitForClient().then(resolve).catch(reject);
          });
        })
        // client rejected, start over
        .catch(function () {
          return _this9.waitForClient().then(resolve).catch(reject);
        });
      });
      return promise;
    }
  }, {
    key: 'waitForAllClients',
    value: function waitForAllClients() {
      var promises = [];
      for (var i = 0; i < this.master.config.size - 1; i++) {
        promises.push(this.waitForClient());
      }
      return rsvp.all(promises);
    }
  }, {
    key: 'waitForClientReady',
    value: function waitForClientReady(uid) {
      var ref = this.clientsRef.child(uid).child('ready');
      this._refs.push(ref);
      var promise = new Promise(function (resolve, reject) {
        ref.on('value', function (snapshot) {
          if (snapshot.val() === true) {
            resolve();
          } else if (snapshot.val() !== false) {
            reject();
          }
        });
      });
      promise.then(function () {
        return ref.off('value');
      }).catch(function () {
        return ref.off('value');
      });
      return promise;
    }
  }, {
    key: 'waitForAllClientsReady',
    value: function waitForAllClientsReady() {
      var _this10 = this;

      var promises = [];
      this._uids.forEach(function (uid) {
        promises.push(_this10.waitForClientReady(uid));
      });
      return rsvp.all(promises);
    }
  }, {
    key: 'alloff',
    value: function alloff() {
      var refs = this._refs.splice(0);
      if (this.clientsRef) refs.push(this.clientsRef);
      if (this.roomRef) refs.push(this.roomRef);
      refs.forEach(function (ref) {
        ref.off('value');
        ref.off('child_added');
        ref.off('child_removed');
      });
    }
  }, {
    key: 'destroy',
    value: function destroy() {
      this.alloff();
      this._refs = [];

      if (this.roomRef) {
        this.roomRef.remove();
      }

      this.roomRef = null;
      this.clientsRef = null;
    }
  }]);

  return BattleRoomServer;
}();