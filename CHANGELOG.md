# Jurnal de modificări — Ecoul Spectral

Format: [SemVer](https://semver.org/lang/ro/) MAJOR.MINOR.PATCH.

## 2.1.0 — 2026-10-27 (anterior: v2.0.1)

Stare: stabil · Offline: complet

### Adăugat
- **Pictură spectrală**: în secțiunea Pensulă, selecția poate fi adăugată ca zonă „pictată” — ton (o sinusoidă pe bin, faze fixe, reproductibil) sau zgomot cu bandă limitată, la un nivel RMS ales, plafonat la −12 dBFS. Energia se adaugă direct în STFT și se resintetizează prin ISTFT-ul existent, în aceeași trecere cu atenuările pensulei (anulare/refacere/listă comune; zonele de atenuare suprapuse atenuează și sunetul pictat). Nu recuperează informație: adaugă sunet nou.
- **Segmente (adnotări)**: intervale de timp etichetate din selecție, cu ascultare, salvare WAV 16 biți, export listă CSV și JSON, marcaj pe spectrogramă; se șterg la încărcarea altui fișier.
- **Comparare a două înregistrări**: spectru mediu pe termen lung (Welch, Hann 4096) în benzi de 1/3 de octavă, în dBFS necalibrat; tabel, grafic, CSV, ascultare A/B, aliniere opțională a RMS-ului lui B (câștig limitat ca vârful ≤ 0,98).
- Texte noi în RO și EN; celelalte limbi folosesc engleza (traducere automată în așteptare).
- Teste noi: `tests/paint-segments-compare-v21.test.mjs`.

### Neimplementat
- Capturi de ecran noi: de adăugat de autor.
- Comparare cu calibrare (dB SPL) și compararea a mai mult de două înregistrări: nu există — nu se pot afirma niveluri acustice absolute fără calibrare.

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
