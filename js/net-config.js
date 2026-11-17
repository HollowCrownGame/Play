// THE HOLLOW CROWN - co-op relay (TURN) settings.
// School, work and many mobile networks block devices from connecting to each other directly. A TURN relay passes
// the game's traffic through a server instead (over port 443, which those networks allow). See SETUP.md, part 6.
//
// Metered "Open Relay" (free tier): sign up at https://www.metered.ca/tools/openrelay/ , create an app, then copy
// the app name (the part before .metered.live) and the API key here:
window.HC_TURN = {
  meteredApp: '',      // e.g. 'hollowcrown'  (from https://hollowcrown.metered.live)
  apiKey: '',          // e.g. 'a1b2c3d4e5f6...'
  // relay servers listed directly (ExpressTURN free plan; tested: UDP and TCP on port 3478 both work, 443 is not offered)
  iceServers: [
    { urls: ['turn:free.expressturn.com:3478', 'turn:free.expressturn.com:3478?transport=tcp'],
      username: '000000002110379885', credential: 'QyfM4wQzazoS9nkj/wLZKNzJsuk=' },
  ],
};
