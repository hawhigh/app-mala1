// Initialize PDF.js and PDF-Lib
const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;

let currentFileBuffer = null;
let currentPdfDoc = null; // The PDFLib document
let pageMetas = []; // { pageIndex: 0, rotation: 0, deleted: false, originalIndex: 0, addedTexts: [] }

const pdfInput = document.getElementById('pdfInput');
const imageInput = document.getElementById('imageInput');
const fileNameDisplay = document.getElementById('fileName');
const gridContainer = document.getElementById('gridContainer');
const actionsPanel = document.getElementById('actions');
const loader = document.getElementById('loader');

// Buttons & Inputs
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const deleteBtn = document.getElementById('deleteBtn');
const saveBtn = document.getElementById('saveBtn');

const textInput = document.getElementById('textInput');
const textColor = document.getElementById('textColor');
const addTextBtn = document.getElementById('addTextBtn');

const exportImagesBtn = document.getElementById('exportImagesBtn');

// --- File Loading ---

pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleFileLoad(file.name, await file.arrayBuffer());
});

imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    loader.style.display = 'block';
    loader.textContent = 'Creating PDF from images...';
    actionsPanel.style.display = 'none';
    gridContainer.innerHTML = '';

    try {
        // Create a new PDF
        const pdfDoc = await PDFDocument.create();

        for (const file of files) {
            const buffer = await file.arrayBuffer();
            let image;
            if (file.type === 'image/jpeg') {
                image = await pdfDoc.embedJpg(buffer);
            } else if (file.type === 'image/png') {
                image = await pdfDoc.embedPng(buffer);
            } else {
                continue; // Skip unsupported
            }

            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });
        }

        const pdfBytes = await pdfDoc.save();
        await handleFileLoad(`Converted_${files.length}_images.pdf`, pdfBytes);

    } catch (err) {
        console.error(err);
        alert('Error converting images: ' + err.message);
    } finally {
        loader.style.display = 'none';
    }
});

async function handleFileLoad(name, buffer) {
    fileNameDisplay.textContent = name;
    loader.style.display = 'block';
    loader.textContent = 'Loading PDF...';
    actionsPanel.style.display = 'none';
    gridContainer.innerHTML = '';

    try {
        currentFileBuffer = buffer;
        await loadPdf(currentFileBuffer);
        actionsPanel.style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert('Error loading PDF: ' + err.message);
    } finally {
        loader.style.display = 'none';
    }
}

async function loadPdf(buffer) {
    // Load with PDFLib for manipulation
    currentPdfDoc = await PDFDocument.load(buffer);
    const pageCount = currentPdfDoc.getPageCount();

    // Reset meta
    pageMetas = [];
    for (let i = 0; i < pageCount; i++) {
        pageMetas.push({
            originalIndex: i,
            rotation: 0,
            deleted: false,
            selected: false,
            addedTexts: []
        });
    }

    // Render thumbnails using PDF.js
    await renderThumbnails(buffer);
}

async function renderThumbnails(buffer) {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 });

        const div = document.createElement('div');
        div.className = 'page-item';
        div.dataset.index = i - 1;
        div.onclick = () => toggleSelection(i - 1);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        await page.render(renderContext).promise;

        div.appendChild(canvas);

        const numberBadge = document.createElement('div');
        numberBadge.className = 'page-number';
        numberBadge.textContent = i;
        div.appendChild(numberBadge);

        const rotBadge = document.createElement('div');
        rotBadge.className = 'rotation-indicator';
        div.appendChild(rotBadge);

        const textBadge = document.createElement('div');
        textBadge.className = 'text-indicator';
        textBadge.textContent = 'T';
        div.appendChild(textBadge);

        gridContainer.appendChild(div);
    }
}

function toggleSelection(index) {
    const meta = pageMetas[index];
    if (meta.deleted) return;

    meta.selected = !meta.selected;
    updateGridUI();
}

function updateGridUI() {
    const items = gridContainer.children;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const index = parseInt(item.dataset.index);
        const meta = pageMetas[index];

        if (meta.deleted) {
            item.style.display = 'none';
            continue;
        }

        item.style.display = 'flex';

        if (meta.selected) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }

        // Apply rotation
        const canvas = item.querySelector('canvas');
        canvas.style.transform = `rotate(${meta.rotation}deg)`;

        // Update badges
        const rotBadge = item.querySelector('.rotation-indicator');
        if (meta.rotation !== 0) {
            rotBadge.style.display = 'block';
            rotBadge.textContent = `${meta.rotation}°`;
        } else {
            rotBadge.style.display = 'none';
        }

        const textBadge = item.querySelector('.text-indicator');
        if (meta.addedTexts && meta.addedTexts.length > 0) {
            textBadge.style.display = 'block';
        } else {
            textBadge.style.display = 'none';
        }
    }
}

// --- Actions ---

rotateLeftBtn.addEventListener('click', () => rotateSelected(-90));
rotateRightBtn.addEventListener('click', () => rotateSelected(90));

function rotateSelected(deg) {
    let changed = false;
    pageMetas.forEach(meta => {
        if (meta.selected && !meta.deleted) {
            meta.rotation = (meta.rotation + deg) % 360;
            changed = true;
        }
    });
    if (changed) updateGridUI();
}

deleteBtn.addEventListener('click', () => {
    let changed = false;
    pageMetas.forEach(meta => {
        if (meta.selected && !meta.deleted) {
            meta.deleted = true;
            meta.selected = false;
            changed = true;
        }
    });
    if (changed) updateGridUI();
});

// Add Text
addTextBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (!text) {
        alert('Please enter some text');
        return;
    }
    const color = textColor.value;

    let changed = false;
    pageMetas.forEach(meta => {
        if (meta.selected && !meta.deleted) {
            if (!meta.addedTexts) meta.addedTexts = [];
            meta.addedTexts.push({ text, color });
            changed = true;
        }
    });

    if (changed) {
        updateGridUI();
        textInput.value = '';
    } else {
        alert('Please select pages to add text to.');
    }
});

function hexToRgbObj(hex) {
    // #RRGGBB
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
}

// Save PDF
saveBtn.addEventListener('click', async () => {
    try {
        const newPdf = await PDFDocument.create();
        const helveticaFont = await newPdf.embedFont(StandardFonts.Helvetica);

        const indicesToCopy = pageMetas
            .filter(m => !m.deleted)
            .map(m => m.originalIndex);

        if (indicesToCopy.length === 0) {
            alert('No pages to save!');
            return;
        }

        const copiedPages = await newPdf.copyPages(currentPdfDoc, indicesToCopy);

        let copiedPageIndex = 0;
        for (let i = 0; i < pageMetas.length; i++) {
            const meta = pageMetas[i];
            if (meta.deleted) continue;

            const page = copiedPages[copiedPageIndex];
            const { width, height } = page.getSize();

            // Apply rotation
            const existingRotation = page.getRotation().angle;
            page.setRotation(degrees(existingRotation + meta.rotation));

            // Apply Text
            if (meta.addedTexts) {
                for (const t of meta.addedTexts) {
                    const c = hexToRgbObj(t.color);
                    // Draw text at center for simplicity, or top-left
                    // Let's put it at the top-center
                    const fontSize = 24;
                    const textWidth = helveticaFont.widthOfTextAtSize(t.text, fontSize);

                    page.drawText(t.text, {
                        x: (width - textWidth) / 2,
                        y: height - 50,
                        size: fontSize,
                        font: helveticaFont,
                        color: rgb(c.r, c.g, c.b),
                    });
                }
            }

            newPdf.addPage(page);
            copiedPageIndex++;
        }

        const pdfBytes = await newPdf.save();
        download(pdfBytes, "modified.pdf", "application/pdf");

    } catch (err) {
        console.error(err);
        alert('Error saving PDF: ' + err.message);
    }
});

// Export Images
exportImagesBtn.addEventListener('click', async () => {
    if (!currentFileBuffer) return;

    // Check if any pages selected
    const selectedMetas = pageMetas.filter(m => m.selected && !m.deleted);
    if (selectedMetas.length === 0) {
        alert('Please select pages to export.');
        return;
    }

    loader.style.display = 'block';
    loader.textContent = 'Generating Images...';

    try {
        const zip = new JSZip();
        const loadingTask = pdfjsLib.getDocument({ data: currentFileBuffer });
        const pdf = await loadingTask.promise;

        for (const meta of selectedMetas) {
            const pageNum = meta.originalIndex + 1;
            const page = await pdf.getPage(pageNum);

            // Render at high scale
            const viewport = page.getViewport({ scale: 2.0, rotation: meta.rotation });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Note: Added text is NOT rendered here because we are rendering the original PDF page
            // To support that, we would need to save the PDF to memory first, then render that.
            // For now, we skip "added text" in image export, or we could manually draw it on the canvas.

            // Convert to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            zip.file(`page_${pageNum}.png`, blob);
        }

        const content = await zip.generateAsync({ type: "blob" });
        download(content, "exported_pages.zip", "application/zip");

    } catch (err) {
        console.error(err);
        alert('Error exporting images: ' + err.message);
    } finally {
        loader.style.display = 'none';
    }
});
