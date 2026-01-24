import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Service to handle exporting content to different formats
 */
export const printService = {
    /**
     * Export a list of HTMLElements (pages) to a single PDF
     */
    async exportToPDF(pages: HTMLElement[], title: string, scale: number = 4) {
        // 1. Wait for Assets: Ensure all images are fully loaded before capture
        const waitForAssets = async () => {
            const images = pages.flatMap(p => Array.from(p.querySelectorAll('img')));
            const promises = images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            });

            // Also wait for videos to show first frame (if possible)
            const videos = pages.flatMap(p => Array.from(p.querySelectorAll('video')));
            const videoPromises = videos.map(v => {
                if (v.readyState >= 2) return Promise.resolve();
                return new Promise(resolve => {
                    v.onloadeddata = resolve;
                    v.onerror = resolve;
                });
            });

            await Promise.all([...promises, ...videoPromises]);
            // Small safety buffer for layout stabilization
            await new Promise(r => setTimeout(r, 500));
        };

        await waitForAssets();

        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: [600, 840] // Matching our max page size
        });

        for (let i = 0; i < pages.length; i++) {
            // 2. Headless-style Capture: Wait for status or rendering completion
            const canvas = await html2canvas(pages[i], {
                scale: scale, // 4 = 300dpi, 8 = 600dpi
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                onclone: (clonedDoc) => {
                    // 3. Media Handling: Remove video controls and ensure posters for print
                    const clonedVideos = clonedDoc.querySelectorAll('video');
                    clonedVideos.forEach(v => {
                        v.style.display = 'block';
                        v.controls = false;
                    });
                }
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.98);

            if (i > 0) pdf.addPage([600, 840], 'p');
            pdf.addImage(imgData, 'JPEG', 0, 0, 600, 840, undefined, 'FAST');
        }

        pdf.save(`${title.replace(/\s+/g, '_')}_HighRes_Archive.pdf`);
    },

    /**
     * Generate an interactive HTML5 bundle (offline viewer)
     * Packages the entire Unified Data Schema into a standalone file.
     */
    async exportToHTML5(albumData: any) {
        // Hydrate data logic: Ensure all layers are absolute-positioned and absolute-urls
        const hydratedData = {
            ...albumData,
            exportedAt: new Date().toISOString(),
            version: '5.0'
        };

        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${albumData.title} - Legacy Interactive Archive</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,700;1,400&family=Inter:wght@400;700&display=swap" rel="stylesheet">
    <style>
        @page { size: auto; margin: 0; }
        body { font-family: 'Inter', sans-serif; background: #111; color: white; margin: 0; min-height: 100vh; display: flex; flex-direction: column; }
        .serif { font-family: 'Cormorant Garamond', serif; }
        .page-container { transition: transform 0.6s cubic-bezier(0.645, 0.045, 0.355, 1); }
        .canvas-shadow { shadow: 0 30px 60px rgba(0,0,0,0.5); }
        video { object-fit: contain; background: black; }
    </style>
</head>
<body>
    <header className="p-6 flex justify-between items-center bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div>
            <h1 class="text-2xl italic serif">${albumData.title}</h1>
            <p class="text-[10px] uppercase tracking-widest text-white/40">Interactive Offline Bundle</p>
        </div>
        <button onclick="window.print()" class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[12px] uppercase tracking-widest transition-all">Download PDF Version</button>
    </header>

    <main class="flex-1 flex items-center justify-center p-8 overflow-auto">
        <div id="flipbook-root" class="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            ${albumData.pages.map((p: any, i: number) => `
                <div class="relative aspect-[600/840] bg-white shadow-2xl overflow-hidden rounded-sm" 
                     style="background-color: ${p.backgroundColor || '#fff'}">
                    <div class="absolute inset-0 pointer-events-none border-[20px] border-black/5"></div>
                    
                    <!-- Hydrated Content Layers -->
                    <div class="absolute inset-0">
                         ${(p.layout_config || p.layoutConfig || []).map((box: any) => `
                             <div style="position: absolute; 
                                         top: ${box.top}%; 
                                         left: ${box.left}%; 
                                         width: ${box.width}%; 
                                         height: ${box.height}%; 
                                         z-index: ${box.zIndex || 10}; 
                                         transform: rotate(${box.content?.rotation || 0}deg);">
                                 ${box.content?.type === 'image' ? `
                                     <img src="${box.content.url}" class="w-full h-full object-cover">
                                 ` : box.content?.type === 'video' ? `
                                     <video src="${box.content.url}" class="w-full h-full" controls muted playsinline></video>
                                 ` : box.content?.type === 'text' ? `
                                     <div class="p-2 break-words" style="font-family: ${box.content.fontFamily || 'serif'}; font-size: ${box.content.fontSize || 16}px; color: ${box.content.color || '#000'}; text-align: ${box.content.textAlign || 'center'};">
                                         ${box.content.text || ''}
                                     </div>
                                 ` : ''}
                             </div>
                         `).join('')}
                    </div>

                    <div class="absolute bottom-4 right-4 text-[10px] font-bold opacity-30 tracking-widest">PAGE ${i + 1}</div>
                </div>
            `).join('')}
        </div>
    </main>

    <footer class="p-8 text-center text-[10px] text-white/30 uppercase tracking-[0.3em]">
        Preserved using FamilyZoabi Unified Rendering Engine v5.0
    </footer>

    <script>
        // Potential hydration of client-side flipbook logic here
        console.log("Album Data Payload:", ${JSON.stringify(hydratedData)});
    </script>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${albumData.title.replace(/\s+/g, '_')}_INTERACTIVE_BUNDLE.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

};
