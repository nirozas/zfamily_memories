# Sounds Directory

This directory contains audio files for the flipbook viewer.

## Required Files

### flip.mp3
A page flip sound effect that plays when users turn pages in the album viewer.

**Recommendation:** Download a free page flip sound effect from:
- [Mixkit](https://mixkit.co/free-sound-effects/flip/) - Free sound effects library
- [Freesound.org](https://freesound.org/) - Community sound library
- [Zapsplat](https://www.zapsplat.com/) - Free sound effects

**Specifications:**
- Format: MP3
- Duration: 0.5-1 second recommended
- Volume: Mid-level (can be adjusted in code)

**Installation:**
1. Download a page flip sound effect
2. Save it as `flip.mp3` in this directory (`public/sounds/flip.mp3`)
3. The flipbook viewer will automatically use it

## Fallback
The application includes a fallback online sound URL if the local file is not found, but for best performance and offline support, a local file is recommended.
