import { AlbumDataService } from './src/services/albumDataService.js';
import { unifiedAlbumToContextAlbum } from './src/lib/albumAdapters.js';

async function run() {
    const album = await AlbumDataService.fetchAlbum('dc5d1b4e-deb4-4a6a-8bdd-149afd4f3f15');
    console.log("UnifiedAlbum pages length:", album.pages.length);
    if (album.pages.length > 0) {
        console.log("First unified page:", JSON.stringify(album.pages[0]));
        const contextAlbum = unifiedAlbumToContextAlbum(album);
        console.log("First context page:", JSON.stringify(contextAlbum.pages[0]));
    }
}
run().catch(console.error);
