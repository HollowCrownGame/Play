# Putting The Hollow Crown online (GitHub Pages + Firebase)

The game is plain HTML/JS, so GitHub Pages can host it for free. GitHub Pages can't store anything, though, so the
**access codes, the Maker seat, usernames, roles and bans live in Firebase** (Google's free tier is plenty).
Co-op itself stays peer-to-peer (PeerJS), exactly as before.

Until `js/firebase-config.js` is filled in, the game runs in **local test mode**: everything works, but the data is
stored only in that one browser. Don't share the game in that state - every visitor would get their own Maker seat.

---

## 1. Create the Firebase project (once, ~5 minutes)

1. Go to <https://console.firebase.google.com> and click **Add project**. Any name (e.g. `hollow-crown`). Analytics is not needed.
2. **Build -> Authentication -> Get started -> Sign-in method -> Anonymous -> Enable -> Save.**
   (Each device gets its own anonymous account. That's what "saved to this device" means.)
3. **Build -> Firestore Database -> Create database.** Pick a region near your players and start in **production mode**.
4. Open the **Rules** tab of Firestore, delete what's there, paste the whole contents of [`firestore.rules`](firestore.rules), and click **Publish**.
   These rules are what really enforce the system. Without them anyone could edit the database.
5. **Project settings** (gear icon) -> **Your apps** -> the `</>` (Web) button -> register an app (no hosting needed).
   Firebase shows a `firebaseConfig = { ... }` object. Copy it into `js/firebase-config.js`:

   ```js
   window.HC_FIREBASE = {
     apiKey: "AIza...",
     authDomain: "hollow-crown.firebaseapp.com",
     projectId: "hollow-crown",
     storageBucket: "hollow-crown.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

   This config is **not a secret**: it only says which project to talk to. It's safe in a public repo; the rules from step 4 protect the data.

## 2. Publish on GitHub Pages

1. Create a repository and push this folder. `.gitignore` already leaves out `_downloads/` (~3 GB of raw source assets) and `_build/`.
   The biggest file, `js/models.js`, is about 25 MB, well under GitHub's 100 MB limit.
2. Repository **Settings -> Pages -> Source: Deploy from a branch -> `main` / root -> Save.**
   After a minute the game is at `https://<your-user>.github.io/<repo>/`.
3. Back in Firebase: **Authentication -> Settings -> Authorized domains -> Add domain -> `<your-user>.github.io`.**

## 3. Claim the Maker seat

1. Open the game **on the device you want to own it from** and enter the code **`Admin`**.
   It works exactly once. After that it says "Wrong code" for everyone, including you on other devices.
2. Choose your name. You're the Maker: the **Maker Panel** button is on the title screen, and in-game it opens with **F8** or from the pause menu.
3. **Don't clear that browser's site data.** It holds the Maker account. Before you need it, make yourself a
   spare: in the Maker Panel, create an **Admin code** with 1 use and redeem it on your other device(s).

## 4. Letting people in

Maker Panel -> **Access codes**:

* **Player code**: a new player enters it once, picks a username, and is in for good on that device.
  "Uses" is how many people can use it (e.g. 1 for a single friend, 50 for a Discord server).
* **Admin code**: whoever enters it becomes an admin (everything except managing other admins and the Maker).
  The number of admin-code uses left is how many more admins there can be. Raise, lower or delete codes at any time.
* A code can also hand out a **role** automatically.

## 5. Roles, commands and bans

* **Roles** tab: create a role (name + colour) and tick the commands it may use, e.g. a *Moderator* with `/kick`, `/mute`, `/tempban`.
  Give roles on the **Players** tab. The role name shows as a coloured tag in chat.
* **Players** tab: change roles, make admins (Maker only), mute, temp-ban (minutes), ban forever, unban, or revoke access.
  A ban takes effect instantly: the player is thrown out of any game they're in and sees the ban screen until it expires.
* In-game, press **Enter** and type `/help` to see the commands you can use:

| Command | What it does |
|---|---|
| `/announce <message>` | Banner + chat message to everyone |
| `/heal [player\|all]` | Restore health, stamina and flasks |
| `/revive <player>` | Lift a fallen player |
| `/kill <player>` | Strike a player down |
| `/god [player]` | Toggle invulnerability |
| `/speed <x> [player]` | Movement speed multiplier (max 5) |
| `/give <player> <ash\|flask> <amount>` | Give ashes or Ember Flasks |
| `/tp <player>` / `/bring <player\|all>` | Teleport to someone / bring them to you |
| `/spawn <enemy> [count]` | Summon enemies (hollow, drowned, knight, arbalist, wraith, watcher) |
| `/clear [radius]` | Destroy enemies around you |
| `/flag <key> <on\|off>` | Set a story flag |
| `/kick <player> [reason]` | Remove someone from the current journey |
| `/mute`, `/unmute <name> [minutes]` | Chat mute |
| `/tempban <name> <minutes> [reason]`, `/ban <name> [reason]`, `/unban <name>` | Account bans |

The co-op **host** checks every command against the sender's account and role before running it. Bans and mutes are also
enforced by the Firestore rules, so editing the page's JavaScript doesn't get around them.

## Limits worth knowing

* Accounts are per browser. Clearing site data, or a private window, means entering a code again. The old name stays reserved.
* Co-op is peer-to-peer: whoever hosts runs the world. A player who modifies their own copy of the game can cheat *their own*
  character (as in any P2P game). They can't run commands, ban, change roles or get past the gate.
