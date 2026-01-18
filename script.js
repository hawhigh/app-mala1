// Initialize PDF.js
const { PDFDocument, degrees } = PDFLib;

let currentFileBuffer = null;
let currentPdfDoc = null; // The PDFLib document
let pageMetas = []; // { pageIndex: 0, rotation: 0, deleted: false, originalIndex: 0 }

const pdfInput = document.getElementById('pdfInput');
const fileNameDisplay = document.getElementById('fileName');
const gridContainer = document.getElementById('gridContainer');
const actionsPanel = document.getElementById('actions');
const loader = document.getElementById('loader');

// Buttons
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const deleteBtn = document.getElementById('deleteBtn');
const saveBtn = document.getElementById('saveBtn');

pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    loader.style.display = 'block';
    actionsPanel.style.display = 'none';
    gridContainer.innerHTML = '';

    try {
        currentFileBuffer = await file.arrayBuffer();
        await loadPdf(currentFileBuffer);
        actionsPanel.style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert('Error loading PDF: ' + err.message);
    } finally {
        loader.style.display = 'none';
    }
});

async function loadPdf(buffer) {
    // Load with PDFLib for manipulation
    currentPdfDoc = await PDFDocument.load(buffer);
    const pageCount = currentPdfDoc.getPageCount();

    // Reset meta
    pageMetas = [];
    for (let i = 0; i < pageCount; i++) {
        pageMetas.push({
            originalIndex: i,
            rotation: 0, // Cumulative rotation added by user
            deleted: false,
            selected: false
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

        // Apply rotation to the canvas visual
        const canvas = item.querySelector('canvas');
        // Initial rotation from PDF is already rendered. We just rotate the DIV content visually?
        // Actually, transforming the canvas with CSS is easiest.
        // But the layout might break if width/height swaps.
        // For simplicity, we just rotate the canvas using CSS transform.
        canvas.style.transform = `rotate(${meta.rotation}deg)`;

        // Update badges
        const rotBadge = item.querySelector('.rotation-indicator');
        if (meta.rotation !== 0) {
            rotBadge.style.display = 'block';
            rotBadge.textContent = `${meta.rotation}°`;
        } else {
            rotBadge.style.display = 'none';
        }
    }
}

// Actions
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
            meta.selected = false; // Deselect after delete
            changed = true;
        }
    });
    if (changed) updateGridUI();
});

saveBtn.addEventListener('click', async () => {
    try {
        // Create a new PDF
        const newPdf = await PDFDocument.create();

        // Indices to copy
        const indicesToCopy = pageMetas
            .filter(m => !m.deleted)
            .map(m => m.originalIndex);

        if (indicesToCopy.length === 0) {
            alert('No pages to save!');
            return;
        }

        // Copy pages
        const copiedPages = await newPdf.copyPages(currentPdfDoc, indicesToCopy);

        // Add pages to new PDF and apply rotation
        let copiedPageIndex = 0;
        for (let i = 0; i < pageMetas.length; i++) {
            const meta = pageMetas[i];
            if (meta.deleted) continue;

            const page = copiedPages[copiedPageIndex];

            // Apply existing rotation + user rotation
            const existingRotation = page.getRotation().angle;
            page.setRotation(degrees(existingRotation + meta.rotation));

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
