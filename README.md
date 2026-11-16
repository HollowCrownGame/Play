# The Hollow Crown

A dark-fantasy co-op horror RPG for the browser (Three.js).

## Play
Double-click `index.html`. If you only get a black screen, double-click `Play.cmd` instead (it needs Node.js); it serves the folder locally and opens the game. You need an internet connection, because Three.js, the Draco decoder and PeerJS load from CDNs.
The game is invite-only. The first screen asks for an access code, and after that a username (both saved to your device).
The very first person to enter **`Admin`** becomes the **Maker** (owner/admin). That code then never works again.
The Maker hands out player/admin codes, creates roles with chosen `/commands`, and can mute, kick, temp-ban or ban players.
**To put it online (GitHub Pages + free Firebase), follow [SETUP.md](SETUP.md).** Until then it runs in local test mode.
- **Begin Alone**: single player.
- **Host Co-op**: shows a 5-letter code. Friends enter it and press **Join** (up to 4 players).

Controls: WASD move · mouse look (click to capture) · LMB attack · Q heavy · RMB block · Space roll · Shift sprint · Tab lock-on · R flask · E interact/revive · F lantern · V first person · G ping · M map · Enter chat.

## Assets (all CC0 / public domain)
- **Characters & animation:** Quaternius *Universal Base Characters*, *Modular Character Outfits – Fantasy*, and *Universal Animation Library* (motion clips shared by every character). Armor, helms, robes, crowns and the Bell-Bearer's bell were generated in Blender on top of these bodies.
- **Buildings & nature:** Quaternius *Medieval Village MegaKit* (houses assembled in Blender on its 2 m grid) and *Stylized Nature MegaKit*.
- **Realistic scans & textures:** Poly Haven (gothic statue, dead trunk, moss rocks; forest ground, mud, rocky trail, castle brick, medieval blocks, cobblestone and wood textures).
- **Built entirely in Blender:** the chapel, Sunken Cathedral, Ashen Citadel, catacomb props, shrine, weapons, graves and gallows.

## Sound & music
All sounds are sliced and re-encoded by `tools/build_audio2.py` and embedded in `js/sounds.js` (`powershell tools/build_audio2.ps1`). CC-BY works are used under their licenses with thanks:
- **Still North Media** (Ben Jaszczak & Brian Nelson), *Medieval sound effects – Weapon Textures / Weapon Impacts*: sword swings, clashes, armor hits (CC0).
- **Little Robot Sound Factory** (www.littlerobotsoundfactory.com), *Horror* and *Fantasy Sound Effects Libraries*: monsters, zombies, stabs, bone cracks, dirt footsteps, dragon growls, gate, ambiences (CC-BY 3.0).
- **Michel Baradari**, *15 monster grunt/pain/death sounds* (CC-BY 3.0).
- **Matthew Pablo** (www.matthewpablo.com), *Colossal Boss Battle Theme* and *Desolate* (CC-BY 3.0).
- **Alexandr Zhelanov**, *Scary Ambient Wind* (CC-BY 3.0).
- **will_leamon**, *Fleshy Fight Sounds* (OGA-BY 3.0).
- **congusbongus**, *Footsteps on different surfaces* (CC-BY 3.0).
- **Fantozzi** (footsteps), **HaelDB** (armor footsteps), **Paul Wortmann** (*Dark Cavern Ambient*), **Kenney**, **qubodup**, **rubberduck** and other OpenGameArt contributors (CC0).

The downloaded source packs live in `_downloads/`; everything the game uses is pre-processed into `models/` and embedded in `js/models.js` and `js/textures.js`.

## Rebuilding (Blender 5.x)
```
blender -b --factory-startup -P tools/build_anims.py -- "_downloads/quaternius/UAL/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"
blender -b --factory-startup -P tools/build_chars3.py
blender -b --factory-startup -P tools/build_env3.py
blender -b --factory-startup -P tools/build_env.py
powershell tools/embed_textures.ps1
powershell tools/embed_models.ps1
```
All meshes are Draco-compressed, and textures are downscaled to 512–1024 px JPEG to keep the embedded build at about 24 MB.
