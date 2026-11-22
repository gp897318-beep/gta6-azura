# AZURA — An Open-World Crime Game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/gp897318-beep/gta6-azura/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/gp897318-beep/gta6-azura/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [gta6-01](https://make.fun/bounty/gta6-01) bounty on make.fun.
Golden hour over the canal city of Azura. Ten jobs from fixer Luna Marlowe.
Steal cars, outrun Azura PD, race the canal road, drive taxi fares, upgrade
your ride at the Old Harbor garage — and make a name for yourself from
Marina Canal to the pier.

**This is a fully original game.** No real city, person or brand appears in it.

## How to play

Serve the game (Node 22, no dependencies) and open it in a desktop browser:

```sh
node serve.ts
# → http://localhost:8080
```

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| E | Enter / steal a car, exit |
| Click | Shoot (mouse aims) |
| F | Punch |
| 1–7 | Select weapon |
| Q / R / V | Swap plates / Quick fix / Eyes out |
| N | Nitro (when upgraded) |
| T | Side errand (race / taxi / courier / stunt) |
| G | Garage (at Old Harbor) |
| C | Radio station |
| P | Pause |

## What is in the city

- **Five districts** — Marina Canal, Palm Row, Neon Wharf, Old Harbor, Sunset Dunes — plus a beach, a harbor with piers and boats, and a canal road.
- **10 story jobs** from Luna Marlowe: go-to, steal, ram, escape, race and survive stages, with payouts, respect and district standing.
- **Side errands** — street races, taxi fares, courier runs and stunt jumps — and 12 hidden packages to find.
- **Azura PD** — a wanted level from heat, named dispatch units with live statuses (PURSUE / RAMMING / FLANKING / PIT / ROADBLOCK), SWAT vans at five stars and the SKYHOOK-1 helicopter with a spotlight.
- **8 cars** to steal and drive (plus police interceptors and SWAT vans), **7 weapons**, a **garage** with engine / armor / nitro upgrades, **day/night** lighting, **rain**, **3 radio stations** of synth music, and **saves** in localStorage.
- **HUD** — job card, clock, cash, wanted stars, dispatch panel, district standing, weapon rack, minimap, health/armor, speed, radio, crew skills and fixer dialogue.

## Tech

- Three.js (vendored under `game/vendor/`, no network at runtime), plain ES modules, no build step.
- `game/` is the whole game: `index.html`, `style.css`, `src/*.js`.
- `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` and writes `dossier.json` via the vendored make.fun library.
- `serve.ts` is a small static server for local development.

Screenshots are taken by the maker in headless Chromium from the game's own
`?shot=` scenes: `1-cover.jpg` (five-star chase on Palm Dr at golden hour),
`2-drive.jpg`, `3-mission.jpg`, `4-menu.jpg`.
