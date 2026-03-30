# Pittsburgh Bridge Tracker 🌉

**Track your family's journey across Pittsburgh's 446 bridges.**

Pittsburgh is famously known as "The City of Bridges" — with more bridges than any other city in the world. This app started as a family project after moving to Pittsburgh. My daughter was so excited about all the bridges that we decided to see how many we could cross together. One thing led to another, and here we are.

**[Open the app →](https://danielpballer.github.io/Pittsburgh-Bridge-Tracker/)**

---

![Pittsburgh Bridge Tracker screenshot](screenshot.png)

---

## Features

- **Interactive map** with live GPS showing all 66 bridges in the database
- **Bridge check-ins** — tap any bridge to log that you've crossed it
- **Nearest bridge finder** — shows the closest uncrossed bridge with one-tap navigation
- **Bridge info cards** with type, year built, length, neighborhood, fun facts, and photos pulled from Wikipedia
- **Collection screen** with filtering (crossed / uncrossed / bridge type / neighborhood / what it crosses) and sorting (by name, date, year built, length, distance)
- **25 achievement badges** across six categories: Milestones, Rivers, Speed & Streaks, Neighborhoods, Bridge Types, and Special
- **Bridge search** — find any bridge by name instantly
- **Backup & restore** — export your check-in data as a JSON file and import it back anytime
- **Shareable progress card** — generate a PNG image of your stats to share with friends and family
- **About page** with app info and data sources
- **Installable PWA** — add to your home screen for a full app experience
- **Works offline** — once loaded, the app works without a connection

## Achievement Badges

| Category | Badges |
|---|---|
| Milestone | First Steps, Double Digits, Quarter Century, Fifty and Counting, Century Club, Halfway There, Bridge Master |
| Rivers | Allegheny Explorer, Monongahela Navigator, Ohio Adventurer, Three Rivers Champion |
| Speed & Streaks | Bridge Blitz, On Fire, Weekly Warrior, Marathon |
| Neighborhoods | Neighborhood Complete, Well Traveled, City Explorer |
| Bridge Types | Truss Collector, Arch Enthusiast, Type Sampler |
| Special | History Buff, Modern Explorer, Going the Distance, Old Faithful |

## Tech Stack

- **Vanilla HTML, CSS, and JavaScript** — no build step, no framework, no dependencies to manage
- **[Leaflet.js](https://leafletjs.com/)** with OpenStreetMap tiles for the interactive map
- **LocalStorage** for persisting check-ins and data locally on your device
- **Wikipedia REST API** for fetching bridge photos at runtime
- **Progressive Web App** with a service worker for offline support and home screen installation
- **Deployed as static files on GitHub Pages** — no server, no API keys required

## Data Sources

- [City of Pittsburgh Open Data Portal](https://data.wprdc.org/)
- [Western Pennsylvania Regional Data Center (WPRDC)](https://www.wprdc.org/)
- [OpenStreetMap](https://www.openstreetmap.org/)
- [Wikipedia](https://www.wikipedia.org/) (bridge photos)

## How to Use

1. Open the [live app](https://danielpballer.github.io/Pittsburgh-Bridge-Tracker/) on your phone
2. Allow location access so the app can show nearby bridges
3. Cross a bridge, tap it on the map, and check it in
4. For the best experience, tap **Add to Home Screen** in your browser to install it as an app

## License

MIT License — free to use, adapt, and build on.
