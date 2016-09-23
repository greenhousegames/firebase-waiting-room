import rsvp from 'rsvp';

class BattleRoomClient {
  constructor(master) {
    this.waitingRef = null;
    this.clientRef = null;
    this.roomRef = null;
    this.master = master;
    this._refs = [];
  }

  isInRoom() {
    return this.roomRef !== null;
  }

  accept() {
    const startedRef = this.roomRef.child('started');
    this._refs.push(startedRef);
    const promise = new rsvp.Promise((resolve, reject) => {
      startedRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
          resolve();
        }
      });

      this.clientRef.child('ready')
        .set(true)
        .catch(reject);
    });
    promise.finally(() => startedRef.off('value'));
    return promise;
  }

  unaccept() {
    const startedRef = this.roomRef.child('started');
    this._refs.push(startedRef);
    const promise = new rsvp.Promise((resolve, reject) => {
      startedRef.on('value', (snapshot) => {
        if (snapshot.val() === false) {
          resolve();
        }
      });

      this.clientRef.child('ready')
        .set(false)
        .catch(reject);
    });
    promise.finally(() => startedRef.off('value'));
    return promise;
  }

  start() {
    this.alloff();

    this.startWaiting()
      .then(() => {
        this.master.notify('searching for battle');

        // once entered, wait for an invite
        this.waitForInvite()
          .then(() => {
            // wait for server to accept client
            this.master.notify('joining battle');

            this.watchClient()
              .then(() => {
                // client accepted by server
                this.master.notify('battle accepted');

                // wait for room to be ready
                const readyRef = this.roomRef.child('ready');
                this._refs.push(readyRef);
                readyRef.on('value', (snapshot) => {
                  if (snapshot.val() === true) {
                    readyRef.off('value');
                    this.master.ready('battle ready');
                  }
                }, this);
              })
              .catch((error) => {
                // client booted from room, start process over again
                console.log(error);
                this.start();
              });
          })
          .catch((error) => {
            this.master.error('error waiting for battle', error);
          });
      })
      .catch((error) => {
        this.master.error('error joining battle', error);
      });
  }

  initWaiting() {
    if (!this.waitingRef) {
      this.waitingRef = this.master.ref.child('waiting').child(firebase.auth().currentUser.uid);
    }
  }

  startWaiting() {
    this.initWaiting();
    return this.waitingRef.set({
      invite: false,
      size: this.master.config.size
    });
  }

  stopWaiting() {
    this.initWaiting();
    this.waitingRef.off('value');
    const promise = this.waitingRef.remove();
    this.waitingRef = null;
    return promise;
  }

  waitForInvite() {
    this.initWaiting();
    const promise = new rsvp.Promise((resolve, reject) => {
      this.waitingRef.on('value', (snapshot) => {
        if (!this.roomRef) {
          const record = snapshot.val();
          if (record && record.invite) {
            // leave waiting room
            this.stopWaiting()
              .then(() => {
                // join room from invite
                this.joinRoom(record.invite)
                  .then(resolve)
                  .catch(reject);
              })
              .catch(reject);
          }
        }
      }, this);
    });
    promise.finally(() => {
      if (this.waitingRef) {
        this.waitingRef.off('value');
      }
    });
    return promise;
  }

  joinRoom(id) {
    if (!this.roomRef) {
      this.roomRef = this.master.ref.child('rooms').child(id);
    }

    if (!this.clientsRef) {
      this.clientsRef = this.roomRef.child('clients');
    }

    if (!this.clientRef) {
      this.clientRef = this.clientsRef.child(firebase.auth().currentUser.uid);
    }

    return this.clientRef.set({
      allowed: false,
      ready: false
    });
  }

  watchClient() {
    const promise = new rsvp.Promise((resolve, reject) => {
      this.clientRef.on('value', (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          // client booted by server
          reject();
        } else if (val.allowed) {
          // client accepted by server
          resolve();
        }
      }, this);
    });
    promise.finally(() => {
      if (this.clientRef) {
        this.clientRef.off('value');
      }
    });
    return promise;
  }

  alloff() {
    const refs = this._refs.splice(0);
    if (this.waitingRef) refs.push(this.waitingRef);
    if (this.clientsRef) refs.push(this.clientsRef);
    if (this.clientRef) refs.push(this.clientRef);
    if (this.roomRef) refs.push(this.roomRef);
    refs.forEach((ref) => {
      ref.off('value');
      ref.off('child_added');
      ref.off('child_removed');
    });
  }

  destroy() {
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
}

export default BattleRoomClient;
