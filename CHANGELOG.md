# Jurnal de modificări — Ecoul Spectral

Format: [SemVer](https://semver.org/lang/ro/) MAJOR.MINOR.PATCH.

## 2.0.1 — 2026-10-27 (anterior: v2.0.0)

Stare: stabil · Offline: complet

Aplicat după mini-recenzia din 2026-10-27.

### Adăugat / modificat
- Descrierea (meta `description`, Open Graph, Twitter, `manifest.webmanifest`, `app.json`) nu mai este generică: enumeră operațiile reale (regiuni timp–frecvență STFT/ISTFT, pensulă spectrală, voce armonică, scădere spectrală a zgomotului, Mid/Side, fade/tăiere/normalizare, export WAV 16/24 biți).
- README (8 limbi): secțiune „Formate și operații (din codul real)” scrisă pe baza codului (formate de intrare dependente de codecurile browserului, STFT 2048/512, pensulă cu max. 80 zone, HPS 70–400 Hz, ieșire WAV 16/24 biți; nu exportă MP3/FLAC); precizarea că pensula atenuează, nu „pictează”/sintetizează; linii „Stare: stabil”, „Offline: complet”.
- Notă „Capturi de ecran: de adăugat de autor” (depozitul are doar captura ecranului de start).

### Neimplementat
- Capturi de ecran noi ale spațiului de lucru (selecție, voce, zgomot): de adăugat de autor — nu pot fi produse automat.
- Nicio modificare de cod funcțional: versiunea 2.0.1 este doar de texte/descrieri.

## 2.0.0
- Versiunea anterioară (vezi istoricul din README).
