'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var rsvp = require('rsvp');

module.exports = function () {
  function BattleRoomClient(master) {
    _classCallCheck(this, BattleRoomClient);

    this.waitingRef = null;
    this.clientRef = null;
    this.roomRef = null;
    this.master = master;
    this._refs = [];
  }

  _createClass(BattleRoomClient, [{
    key: 'isInRoom',
    value: function isInRoom() {
      return this.roomRef !== null;
    }
  }, {
    key: 'accept',
    value: function accept() {
      var _this = this;

      var startedRef = this.roomRef.child('started');
      this._refs.push(startedRef);
      var promise = new rsvp.Promise(function (resolve, reject) {
        startedRef.on('value', function (snapshot) {
          if (snapshot.val() === true) {
            resolve();
          }
        });

        _this.clientRef.child('ready').set(true).catch(reject);
      });
      promise.finally(function () {
        return startedRef.off('value');
      });
      return promise;
    }
  }, {
    key: 'unaccept',
    value: function unaccept() {
      var _this2 = this;

      var startedRef = this.roomRef.child('started');
      this._refs.push(startedRef);
      var promise = new rsvp.Promise(function (resolve, reject) {
        startedRef.on('value', function (snapshot) {
          if (snapshot.val() === false) {
            resolve();
          }
        });

        _this2.clientRef.child('ready').set(false).catch(reject);
      });
      promise.finally(function () {
        return startedRef.off('value');
      });
      return promise;
    }
  }, {
    key: 'start',
    value: function start() {
      var _this3 = this;

      this.alloff();

      this.startWaiting().then(function () {
        _this3.master.notify('searching for battle');

        // once entered, wait for an invite
        _this3.waitForInvite().then(function () {
          // wait for server to accept client
          _this3.master.notify('joining battle');

          _this3.watchClient().then(function () {
            // client accepted by server
            _this3.master.notify('battle accepted');

            // wait for room to be ready
            var readyRef = _this3.roomRef.child('ready');
            _this3._refs.push(readyRef);
            readyRef.on('value', function (snapshot) {
              if (snapshot.val() === true) {
                readyRef.off('value');
                _this3.master.ready('battle ready');
              }
            }, _this3);
          }).catch(function (error) {
            // client booted from room, start process over again
            console.log(error);
            _this3.start();
          });
        }).catch(function (error) {
          _this3.master.error('error waiting for battle', error);
        });
      }).catch(function (error) {
        _this3.master.error('error joining battle', error);
      });
    }
  }, {
    key: 'initWaiting',
    value: function initWaiting() {
      if (!this.waitingRef) {
        this.waitingRef = this.master.ref.child('waiting').child(this.master.firebase.auth().currentUser.uid);
      }
    }
  }, {
    key: 'startWaiting',
    value: function startWaiting() {
      this.initWaiting();
      return this.waitingRef.set({
        invite: false,
        size: this.master.config.size
      });
    }
  }, {
    key: 'stopWaiting',
    value: function stopWaiting() {
      this.initWaiting();
      this.waitingRef.off('value');
      var promise = this.waitingRef.remove();
      this.waitingRef = null;
      return promise;
    }
  }, {
    key: 'waitForInvite',
    value: function waitForInvite() {
      var _this4 = this;

      this.initWaiting();
      var promise = new rsvp.Promise(function (resolve, reject) {
        _this4.waitingRef.on('value', function (snapshot) {
          if (!_this4.roomRef) {
            (function () {
              var record = snapshot.val();
              if (record && record.invite) {
                // leave waiting room
                _this4.stopWaiting().then(function () {
                  // join room from invite
                  _this4.joinRoom(record.invite).then(resolve).catch(reject);
                }).catch(reject);
              }
            })();
          }
        }, _this4);
      });
      promise.finally(function () {
        if (_this4.waitingRef) {
          _this4.waitingRef.off('value');
        }
      });
      return promise;
    }
  }, {
    key: 'joinRoom',
    value: function joinRoom(id) {
      if (!this.roomRef) {
        this.roomRef = this.master.ref.child('rooms').child(id);
      }

      if (!this.clientsRef) {
        this.clientsRef = this.roomRef.child('clients');
      }

      if (!this.clientRef) {
        this.clientRef = this.clientsRef.child(this.master.firebase.auth().currentUser.uid);
      }

      return this.clientRef.set({
        allowed: false,
        ready: false
      });
    }
  }, {
    key: 'watchClient',
    value: function watchClient() {
      var _this5 = this;

      var promise = new rsvp.Promise(function (resolve, reject) {
        _this5.clientRef.on('value', function (snapshot) {
          var val = snapshot.val();
          if (!val) {
            // client booted by server
            reject();
          } else if (val.allowed) {
            // client accepted by server
            resolve();
          }
        }, _this5);
      });
      promise.finally(function () {
        if (_this5.clientRef) {
          _this5.clientRef.off('value');
        }
      });
      return promise;
    }
  }, {
    key: 'alloff',
    value: function alloff() {
      var refs = this._refs.splice(0);
      if (this.waitingRef) refs.push(this.waitingRef);
      if (this.clientsRef) refs.push(this.clientsRef);
      if (this.clientRef) refs.push(this.clientRef);
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
      this.stopWaiting();
      this.alloff();
      this._refs = [];

      if (this.clientRef) {
        this.clientRef.remove();
      }

      this.waitingRef = null;
      this.clientRef = null;
      this.roomRef = null;
    }
  }]);

  return BattleRoomClient;
}();