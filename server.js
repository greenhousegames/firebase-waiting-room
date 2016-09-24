const rsvp = require('rsvp');

class BattleRoomServer {
  constructor(master) {
    this.clientsRef = null;
    this.roomRef = null;
    this.master = master;
    this._refs = [];
    this._uids = [];
  }

  accept() {
    const promise = new rsvp.Promise((resolve, reject) => {
      const startedRef = this.roomRef.child('started');
      this._refs.push(startedRef);
      startedRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
          startedRef.off('value');
          resolve();
        }
      });

      // wait for all clients to be ready
      this.waitForAllClientsReady()
        .then(() => startedRef.set(true))
        .catch(reject);
    });
    return promise;
  }

  unaccept() {
    const promise = new rsvp.Promise((resolve, reject) => {
      const startedRef = this.roomRef.child('started');
      this._refs.push(startedRef);
      startedRef.on('value', (snapshot) => {
        if (snapshot.val() === false) {
          startedRef.off('value');
          resolve();
        }
      });

      startedRef.set(false).catch(reject);
    });
    return promise;
  }

  start() {
    this.alloff();

    const promise = new rsvp.Promise((resolve, reject) => {
      this.createRoom()
        .then(() => {
          this.waitInRoom().then(resolve).catch(reject);
        })
        .catch((error) => {
          this.master.error('error creating battle', error);
          reject(error);
        });
    });
    return promise;
  }

  resume() {
    this.alloff();

    const promise = new rsvp.Promise((resolve, reject) => {
      this.joinExisting()
        .then((room) => {
          if (!room.started) {
            // remove all clients and start over
            this.clientsRef.remove();
            this.waitInRoom().then(resolve).catch(reject);
          } else {
            // remove room and start over
            this.roomRef.remove();
            this.start().then(resolve).catch(reject);
          }
        })
        .catch(reject);
    });
    return promise;
  }

  joinExisting() {
    const query = this.master.ref.child('rooms')
      .orderByChild('owner')
      .startAt(firebase.auth().currentUser.uid)
      .endAt(firebase.auth().currentUser.uid);
    this._refs.push(query);
    const promise = new rsvp.Promise((resolve, reject) => {
      query.once('value', (snapshot) => {
        const rooms = snapshot.val();
        if (rooms) {
          const roomKey = Object.keys(rooms)[0];
          const room = rooms[roomKey];
          this.joinRoom(roomKey);
          resolve(room);
        } else {
          reject();
        }
      }, this);
    });
    return promise;
  }

  createRoom() {
    this.roomRef = this.master.ref.child('rooms').push();
    this.clientsRef = this.roomRef.child('clients');
    return this.roomRef.set({
      owner: firebase.auth().currentUser.uid,
      started: false,
      ready: false
    });
  }

  joinRoom(key) {
    this.roomRef = this.master.ref.child('rooms').child(key);
    this.clientsRef = this.roomRef.child('clients');
  }

  waitInRoom() {
    this.master.notify('searching for battle');

    const promise = new rsvp.Promise((resolve, reject) => {
      this.waitForAllClients()
        .then((uids) => {
          this._uids = uids;
          this.master.notify('battle accepted');

          // signal game to start
          this.roomRef.child('ready').set(true)
            .then(() => {
              this.master.ready('battle ready');
              resolve();
            })
            .catch((error) => {
              this.master.error('error starting battle', error);
              reject(error);
            });
        })
        .catch((error) => {
          this.master.error('error waiting for opponents', error);
          reject(error);
        });
    });
    return promise;
  }

  sendInvite() {
    const query = this.master.ref.child('waiting')
      .orderByChild('invite')
      .startAt(false)
      .endAt(false);
    this._refs.push(query);
    const promise = new rsvp.Promise((resolve, reject) => {
      const roomId = this.roomRef.key;
      query.on('child_added', (snapshot) => {
        const uid = snapshot.key;
        const val = snapshot.val();
        if (val.size === this.master.config.size) {
          // send invite
          this.master.ref.child('waiting')
            .child(uid)
            .child('invite')
            .set(roomId)
            .then(() => resolve(uid))
            .catch(reject);
        }
      }, this);
    });
    promise.finally(() => query.off('child_added'));
    return promise;
  }

  waitForInviteResponse(uid) {
    let joined = false;
    const clientRef = this.clientsRef.child(uid);
    this._refs.push(clientRef);
    const promise = new rsvp.Promise((resolve, reject) => {
      // wait for client
      clientRef.on('value', (snapshot) => {
        const record = snapshot.val();
        if (record && record.allowed === false) {
          // client joined
          joined = true;
          clientRef.child('allowed').set(true).then(resolve).catch(reject);
        }
      });

      // wait at max 3 seconds for invite response
      setTimeout(() => {
        if (!joined) {
          reject();
        }
      }, this.master.config.MAX_INVITE_WAIT_TIME);
    });
    promise.finally(() => clientRef.off('value'));
    return promise;
  }

  waitForClient() {
    const promise = new rsvp.Promise((resolve, reject) => {
      this.sendInvite()
        .then((uid) => {
          this.waitForInviteResponse(uid)
            // client confirmed
            .then(() => {
              console.log('client joined: ' + uid);
              resolve(uid);
            })
            // client rejected, start over
            .catch(() => this.waitForClient().then(resolve).catch(reject));
        })
        // client rejected, start over
        .catch(() => this.waitForClient().then(resolve).catch(reject));
    });
    return promise;
  }

  waitForAllClients() {
    const promises = [];
    for (let i = 0; i < this.master.config.size - 1; i++) {
      promises.push(this.waitForClient());
    }
    return rsvp.all(promises);
  }


  waitForClientReady(uid) {
    const ref = this.clientsRef.child(uid).child('ready');
    this._refs.push(ref);
    const promise = new rsvp.Promise((resolve, reject) => {
      ref.on('value', (snapshot) => {
        if (snapshot.val() === true) {
          resolve();
        } else if (snapshot.val() !== false) {
          reject();
        }
      });
    });
    promise.finally(() => ref.off('value'));
    return promise;
  }

  waitForAllClientsReady() {
    const promises = [];
    this._uids.forEach((uid) => {
      promises.push(this.waitForClientReady(uid));
    });
    return rsvp.all(promises);
  }

  alloff() {
    const refs = this._refs.splice(0);
    if (this.clientsRef) refs.push(this.clientsRef);
    if (this.roomRef) refs.push(this.roomRef);
    refs.forEach((ref) => {
      ref.off('value');
      ref.off('child_added');
      ref.off('child_removed');
    });
  }

  destroy() {
    this.alloff();
    this._refs = [];

    if (this.roomRef) {
      this.roomRef.remove();
    }

    this.roomRef = null;
    this.clientsRef = null;
  }
}

module.exports = BattleRoomServer;
