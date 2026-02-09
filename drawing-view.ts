import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_DRAWING = 'drawing-canvas-view';

interface DrawingPage {
    id: string;
    name: string;
    drawingData: string | null;
    pageStyle: 'blank' | 'grid' | 'dots';
    createdAt: Date;
    isActive?: boolean;
}

interface SelectionArea {
    x: number;
    y: number;
    width: number;
    height: number;
    imageData: ImageData | null;
    isSelecting: boolean;
    isMoving: boolean;
    offsetX: number;
    offsetY: number;
}

export class DrawingView extends ItemView {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private currentColor: string = '#000000';
    private currentTool: 'brush' | 'eraser' | 'line' | 'selection' = 'brush';
    private brushSize: number = 2;
    private eraserSize: number = 10;
    private isDrawing: boolean = false;
    private lastX: number = 0;
    private lastY: number = 0;
    private lastPreviewX: number = 0;
    private lastPreviewY: number = 0;
    private lineStartPoint: { x: number, y: number } | null = null;
    private pageStyle: 'blank' | 'grid' | 'dots' = 'grid';
    private toolbar: HTMLElement;
    private pagesContainer: HTMLElement;
    private tabsContainer: HTMLElement;
    private currentPageId: string;
    private pages: DrawingPage[] = [];
    private pageCounter: number = 1;
    private pageMap: Map<string, {
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
        drawingCanvas: HTMLCanvasElement,
        drawingContext: CanvasRenderingContext2D,
        linePreviewCanvas: HTMLCanvasElement,
        linePreviewContext: CanvasRenderingContext2D,
        selectionCanvas: HTMLCanvasElement,
        selectionContext: CanvasRenderingContext2D
    }> = new Map();

    // Для инструмента выделения
    private selection: SelectionArea = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        imageData: null,
        isSelecting: false,
        isMoving: false,
        offsetX: 0,
        offsetY: 0
    };
    
    // Буфер для копирования/вставки
    private clipboard: {
        imageData: ImageData | null;
        width: number;
        height: number;
    } | null = null;

    // Для предотвращения выделения текста и перетаскивания
    private isPointerDownOnCanvas: boolean = false;

    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(leaf: WorkspaceLeaf, private plugin: any) {
        super(leaf);
        this.currentPageId = this.generatePageId();
    }

    getViewType(): string {
        return VIEW_TYPE_DRAWING;
    }

    getDisplayText(): string {
        return 'Рисовалка';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) return;

        container.empty();
        this.createUI(container);
        this.createInitialPage();
    }

    createUI(container: HTMLElement) {
        const mainContainer = container.createDiv({ cls: 'drawing-main-container' });
        this.tabsContainer = mainContainer.createDiv({ cls: 'drawing-tabs-container' });
        this.toolbar = mainContainer.createDiv({ cls: 'drawing-toolbar' });
        this.pagesContainer = mainContainer.createDiv({ cls: 'drawing-pages-container' });
        this.createToolbar();
    }

    createToolbar() {
        const brushBtn = this.toolbar.createEl('button', { text: 'Кисть', cls: 'tool-btn active' });
        const eraserBtn = this.toolbar.createEl('button', { text: 'Ластик', cls: 'tool-btn' });
        const lineBtn = this.toolbar.createEl('button', { text: 'Линия', cls: 'tool-btn' });
        const selectionBtn = this.toolbar.createEl('button', { text: 'Выделение', cls: 'tool-btn' });
        const colorPicker = this.toolbar.createEl('input', { type: 'color', value: this.currentColor });

        const brushSizeLabel = this.toolbar.createEl('label', { text: 'Толщина' });
        const brushSizeSlider = this.toolbar.createEl('input', {
            type: 'range',
            attr: { min: '1', max: '40', step: '1' }
        }) as HTMLInputElement;
        brushSizeSlider.value = this.brushSize.toString();

        const pageStyleSelect = this.toolbar.createEl('select');
        pageStyleSelect.createEl('option', { value: 'blank', text: 'Чистая' });
        pageStyleSelect.createEl('option', { value: 'grid', text: 'Клетка' });
        pageStyleSelect.createEl('option', { value: 'dots', text: 'Точки' });
        pageStyleSelect.value = this.pageStyle;

        const newPageBtn = this.toolbar.createEl('button', { text: '+ Новая страница', cls: 'tool-btn new-page-btn' });
        const newPageEndBtn = this.toolbar.createEl('button', { text: '+ В конец', cls: 'tool-btn' });
        const exportBtn = this.toolbar.createEl('button', { text: '📄 Экспорт все в PDF', cls: 'tool-btn export-btn' });

        const hotkeyHint = this.toolbar.createEl('div', {
            cls: 'hotkey-hint',
            attr: { 
                style: 'font-size: 11px; color: var(--text-muted); margin-left: 10px; padding: 4px 8px; background: var(--background-modifier-border); border-radius: 4px;'
            }
        });
        hotkeyHint.innerHTML = 'Выделение: <b>Ctrl+C/V/X</b>, <b>Del</b>, <b>Esc</b>, <b>Drag</b>';

        brushBtn.addEventListener('click', () => this.setActiveTool('brush', brushBtn, eraserBtn, lineBtn, selectionBtn));
        eraserBtn.addEventListener('click', () => this.setActiveTool('eraser', brushBtn, eraserBtn, lineBtn, selectionBtn));
        lineBtn.addEventListener('click', () => this.setActiveTool('line', brushBtn, eraserBtn, lineBtn, selectionBtn));
        selectionBtn.addEventListener('click', () => this.setActiveTool('selection', brushBtn, eraserBtn, lineBtn, selectionBtn));
        
        colorPicker.addEventListener('input', (e) => this.currentColor = (e.target as HTMLInputElement).value);
        brushSizeSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.brushSize = value;
            this.eraserSize = value;
        });

        pageStyleSelect.addEventListener('change', (e) => {
            this.pageStyle = (e.target as HTMLSelectElement).value as 'blank' | 'grid' | 'dots';
            const page = this.pages.find(p => p.id === this.currentPageId);
            if (page) {
                page.pageStyle = this.pageStyle;
                this.redrawPageBackground(page.id);
            }
        });

        newPageBtn.addEventListener('click', () => this.createNewPage(true));
        newPageEndBtn.addEventListener('click', () => this.createNewPage(false));
        exportBtn.addEventListener('click', () => this.exportAllToPDF());

        this.setupKeyboardShortcuts();
    }

    setupKeyboardShortcuts() {
        // Сохраняем ссылку на обработчик для последующего удаления
        this.keydownHandler = (e: KeyboardEvent) => {
            // Проверяем, что мы на активной странице рисования
            if (!this.currentPageId) return;
            
            const pageData = this.pageMap.get(this.currentPageId);
            if (!pageData) return;

            // Ctrl+C - Копировать
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                e.stopPropagation();
                this.copySelection();
                return false;
            }
            
            // Ctrl+X - Вырезать
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                e.preventDefault();
                e.stopPropagation();
                this.cutSelection();
                return false;
            }
            
            // Ctrl+V - Вставить
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                e.stopPropagation();
                this.pasteFromClipboard();
                return false;
            }
            
            // Delete - Удалить выделенное
            if (e.key === 'Delete') {
                e.preventDefault();
                e.stopPropagation();
                this.deleteSelection();
                return false;
            }
            
            // Escape - Снять выделение
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.clearSelection();
                return false;
            }
        };

        document.addEventListener('keydown', this.keydownHandler);
    }


    setActiveTool(tool: 'brush' | 'eraser' | 'line' | 'selection', brushBtn: HTMLButtonElement, eraserBtn: HTMLButtonElement, lineBtn: HTMLButtonElement, selectionBtn: HTMLButtonElement) {
        this.currentTool = tool;

        if (this.canvas) {
            this.canvas.classList.remove('brush-cursor', 'eraser-cursor', 'line-cursor', 'selection-cursor');

            switch (tool) {
                case 'brush':
                    this.canvas.classList.add('brush-cursor');
                    break;
                case 'eraser':
                    this.canvas.classList.add('eraser-cursor');
                    break;
                case 'line':
                    this.canvas.classList.add('line-cursor');
                    break;
                case 'selection':
                    this.canvas.classList.add('selection-cursor');
                    // Сбрасываем выделение при переключении на другой инструмент
                    if (this.selection.isSelecting) {
                        this.clearSelection();
                    }
                    break;
            }
        }

        brushBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        lineBtn.classList.remove('active');
        selectionBtn.classList.remove('active');

        if (tool === 'brush') brushBtn.classList.add('active');
        else if (tool === 'eraser') eraserBtn.classList.add('active');
        else if (tool === 'line') lineBtn.classList.add('active');
        else if (tool === 'selection') selectionBtn.classList.add('active');

        // Очищаем предпросмотр при смене инструмента
        if (tool !== 'line') {
            const pageData = this.pageMap.get(this.currentPageId);
            if (pageData) {
                pageData.linePreviewContext.clearRect(0, 0, 800, 1120);
                this.updatePageDisplay(this.currentPageId);
            }
        }
    }

    createInitialPage() {
        this.pageCounter = 1;
        const initialPageId = this.generatePageId();
        this.createPageElement(initialPageId, `Страница ${this.pageCounter}`, false);
        this.switchToPage(initialPageId);
        this.currentPageId = initialPageId;
    }

    createPageElement(pageId: string, title: string, isActive: boolean = false) {
        const pageContainer = this.pagesContainer.createDiv({
            cls: `canvas-page-container ${isActive ? 'active' : ''}`,
            attr: { 'data-page-id': pageId }
        });

        // Добавляем стили для предотвращения выделения текста
        pageContainer.style.userSelect = 'none';
        pageContainer.setAttribute('style', 'user-select: none; -webkit-user-select: none; -moz-user-select: none;');

        const titleEl = pageContainer.createEl('h3', {
            text: title,
            cls: 'page-title',
            attr: {
                'style': 'user-select: none; -webkit-user-select: none; -ms-user-select: none; -moz-user-select: none; cursor: pointer;'
            }
        });

        const canvas = pageContainer.createEl('canvas', {
            cls: 'drawing-canvas',
            attr: {
                'style': 'touch-action: none;' // Важно для работы с touch событиями
            }
        }) as HTMLCanvasElement;

        canvas.width = 800;
        canvas.height = 1120;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;

        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.width = 800;
        drawingCanvas.height = 1120;
        const drawingContext = drawingCanvas.getContext('2d', { willReadFrequently: true })!;

        const linePreviewCanvas = document.createElement('canvas');
        linePreviewCanvas.width = 800;
        linePreviewCanvas.height = 1120;
        const linePreviewContext = linePreviewCanvas.getContext('2d')!;

        const selectionCanvas = document.createElement('canvas');
        selectionCanvas.width = 800;
        selectionCanvas.height = 1120;
        const selectionContext = selectionCanvas.getContext('2d')!;

        this.pageMap.set(pageId, { 
            canvas, 
            context, 
            drawingCanvas, 
            drawingContext, 
            linePreviewCanvas, 
            linePreviewContext,
            selectionCanvas,
            selectionContext
        });
        this.drawBackground(context, this.pageStyle);

        if (isActive) {
            this.canvas = canvas;
            this.context = context;
            this.setupCanvasEventListeners(canvas);
        }

        // Обработчик для переключения страниц - только для НЕ активных страниц
        if (!isActive) {
            pageContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (pageId !== this.currentPageId) {
                    this.switchToPage(pageId);
                }
                return false;
            });

            // Для touch устройств
            pageContainer.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (pageId !== this.currentPageId) {
                    this.switchToPage(pageId);
                }
                return false;
            }, { passive: false });

            pageContainer.style.cursor = 'pointer';
            titleEl.style.cursor = 'pointer';
        } else {
            // Для активной страницы предотвращаем клик на контейнере
            pageContainer.addEventListener('click', (e) => {
                if (e.target !== canvas) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            });

            pageContainer.addEventListener('touchstart', (e) => {
                if (e.target !== canvas) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, { passive: false });
        }

        const page: DrawingPage = {
            id: pageId,
            name: title,
            drawingData: null,
            pageStyle: this.pageStyle,
            createdAt: new Date(),
            isActive
        };

        this.pages.push(page);
        this.createTab(pageId, title, isActive);
    }

    private setupCanvasClickForDeselection() {
        // Добавляем обработчик на сам canvas
        if (this.canvas) {
            this.canvas.addEventListener('click', (e) => {
                if (this.currentTool === 'selection' && this.selection.imageData) {
                    const coords = this.getCanvasCoordinates(e);
                    if (coords) {
                        // Если кликнули вне выделенной области - снимаем выделение
                        if (!(coords.x >= this.selection.x && 
                            coords.x <= this.selection.x + this.selection.width &&
                            coords.y >= this.selection.y && 
                            coords.y <= this.selection.y + this.selection.height)) {
                            this.clearSelection();
                        }
                    }
                }
            });
        }
    }

    setupCanvasEventListeners(canvas: HTMLCanvasElement) {
        // Удаляем старые обработчики если они есть
        this.removeCanvasEventListeners();

        // МЫШЬ
        canvas.addEventListener('mousedown', this.handlePointerStart);
        canvas.addEventListener('mousemove', this.handlePointerMove);
        canvas.addEventListener('mouseup', this.handlePointerEnd);
        canvas.addEventListener('mouseleave', this.handlePointerLeave);
        canvas.addEventListener('mouseenter', this.handlePointerEnter);

        // TOUCH (для сенсорных экранов и граф планшетов)
        canvas.addEventListener('touchstart', this.handlePointerStart, { passive: false });
        canvas.addEventListener('touchmove', this.handlePointerMove, { passive: false });
        canvas.addEventListener('touchend', this.handlePointerEnd, { passive: false });
        canvas.addEventListener('touchcancel', this.handlePointerLeave, { passive: false });

        // POINTER API (универсальный API для мыши, стилуса, touch)
        if ('PointerEvent' in window) {
            canvas.addEventListener('pointerdown', this.handlePointerStart);
            canvas.addEventListener('pointermove', this.handlePointerMove);
            canvas.addEventListener('pointerup', this.handlePointerEnd);
            canvas.addEventListener('pointerleave', this.handlePointerLeave);
            canvas.addEventListener('pointerenter', this.handlePointerEnter);
        }

        // Предотвращаем контекстное меню на canvas
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        // Предотвращаем выделение текста при перетаскивании
        canvas.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });

        // Предотвращаем выделение при двойном клике
        canvas.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });

        // Обновляем курсор при входе на canvas
        this.updateCursorForCurrentTool();
        this.setupCanvasClickForDeselection();
    }

    removeCanvasEventListeners() {
        if (!this.canvas) return;

        const events = [
            'mousedown', 'mousemove', 'mouseup', 'mouseleave',
            'touchstart', 'touchmove', 'touchend', 'touchcancel',
            'pointerdown', 'pointermove', 'pointerup', 'pointerleave'
        ];

        events.forEach(event => {
            this.canvas.removeEventListener(event, this.handlePointerStart as EventListener);
            this.canvas.removeEventListener(event, this.handlePointerMove as EventListener);
            this.canvas.removeEventListener(event, this.handlePointerEnd as EventListener);
            this.canvas.removeEventListener(event, this.handlePointerLeave as EventListener);
        });
    }

    getCanvasCoordinates = (e: MouseEvent | TouchEvent | PointerEvent): { x: number, y: number } | null => {
        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return null;

        const canvas = pageData.canvas;
        const rect = canvas.getBoundingClientRect();

        let clientX: number, clientY: number;
        if (e instanceof MouseEvent) {
            clientX = e.clientX;
            clientY = e.clientY;
        } else if (e instanceof TouchEvent && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if ('clientX' in e) {
            clientX = (e as any).clientX;
            clientY = (e as any).clientY;
        } else return null;

        // КЛЮЧЕВОЙ МОМЕНТ: Масштабируем координаты
        // Вычисляем отношение внутреннего размера холста к его размеру в CSS
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    handlePointerStart = (e: MouseEvent | TouchEvent | PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        this.isPointerDownOnCanvas = true;

        const coords = this.getCanvasCoordinates(e);
        if (!coords) return;

        this.lastX = coords.x;
        this.lastY = coords.y;

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        if (this.currentTool === 'selection') {
            // Проверяем, кликнули ли внутри существующего выделения
            if (this.selection.imageData && 
                    this.lastX >= this.selection.x && 
                    this.lastX <= this.selection.x + this.selection.width &&
                    this.lastY >= this.selection.y && 
                    this.lastY <= this.selection.y + this.selection.height) {
                    
                    this.selection.isMoving = true;
                    this.selection.offsetX = this.lastX - this.selection.x;
                    this.selection.offsetY = this.lastY - this.selection.y;

                    // ОЧИЩАЕМ ОРИГИНАЛ: чтобы при перемещении под выделением была пустота
                    pageData.drawingContext.clearRect(
                        this.selection.x, this.selection.y, 
                        this.selection.width, this.selection.height
                    );
                    this.updatePageDisplay(this.currentPageId);
            } else {
                // Начинаем новое выделение (сбрасываем старое если есть)
                if (this.selection.imageData) {
                    this.applySelection(); // Применяем текущее выделение перед созданием нового
                }
                
                this.selection.isSelecting = true;
                this.selection.x = this.lastX;
                this.selection.y = this.lastY;
                this.selection.width = 0;
                this.selection.height = 0;
                this.selection.imageData = null;
            }
        } else if (this.currentTool === 'line') {
            this.lineStartPoint = { x: this.lastX, y: this.lastY };
        } else {
            // Если есть выделение и кликаем другим инструментом - применяем его
            if (this.selection.imageData) {
                this.applySelection();
            }
            
            this.isDrawing = true;

            // Начинаем новый путь на drawing canvas
            pageData.drawingContext.beginPath();
            pageData.drawingContext.moveTo(this.lastX, this.lastY);

            // Сразу рисуем точку для коротких касаний
            if (this.currentTool === 'brush') {
                pageData.drawingContext.strokeStyle = this.currentColor;
                pageData.drawingContext.lineWidth = this.brushSize;
                pageData.drawingContext.lineCap = 'round';
                pageData.drawingContext.lineTo(this.lastX, this.lastY);
                pageData.drawingContext.stroke();

                // Обновляем отображение
                this.updatePageDisplay(this.currentPageId);
            }
        }

        // Предотвращаем выделение текста на всей странице
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
    };

    handlePointerMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
        if (!this.isPointerDownOnCanvas) return;

        e.preventDefault();
        e.stopPropagation();

        const coords = this.getCanvasCoordinates(e);
        if (!coords) return;

        const x = coords.x;
        const y = coords.y;

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        if (this.currentTool === 'selection') {
            if (this.selection.isMoving && this.selection.imageData) {
                // Перемещаем выделение
                this.selection.x = x - this.selection.offsetX;
                this.selection.y = y - this.selection.offsetY;
                
                // Ограничиваем выделение границами canvas
                this.selection.x = Math.max(0, Math.min(this.selection.x, 800 - this.selection.width));
                this.selection.y = Math.max(0, Math.min(this.selection.y, 1120 - this.selection.height));
                
                this.drawSelection();
            } else if (this.selection.isSelecting) {
                // Обновляем размер выделения
                this.selection.width = x - this.selection.x;
                this.selection.height = y - this.selection.y;
                this.drawSelection();
            } else {
                // Обновляем курсор если наводим на выделение
                if (this.selection.imageData && 
                    x >= this.selection.x && x <= this.selection.x + this.selection.width &&
                    y >= this.selection.y && y <= this.selection.y + this.selection.height) {
                    this.canvas.style.cursor = 'move';
                } else {
                    this.canvas.style.cursor = 'crosshair';
                }
            }
        } else if (this.currentTool === 'line' && this.lineStartPoint) {
            // Обновляем предпросмотр только если координаты значительно изменились
            if (Math.abs(x - this.lastPreviewX) > 0.5 || Math.abs(y - this.lastPreviewY) > 0.5) {
                this.showLinePreview(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
            }
        } else if (this.isDrawing) {
            this.drawFreehand(x, y);
        }
    };

    handlePointerEnd = (e: MouseEvent | TouchEvent | PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const coords = this.getCanvasCoordinates(e);

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        if (this.currentTool === 'selection') {
            if (this.selection.isMoving) {
                // Завершаем перемещение
                this.selection.isMoving = false;
                // Применяем перемещение к основному изображению
                this.applyMovedSelection();
            } else if (this.selection.isSelecting) {
                // Завершаем выделение
                this.selection.isSelecting = false;
                
                // Нормализуем координаты выделения
                if (this.selection.width < 0) {
                    this.selection.x += this.selection.width;
                    this.selection.width = Math.abs(this.selection.width);
                }
                if (this.selection.height < 0) {
                    this.selection.y += this.selection.height;
                    this.selection.height = Math.abs(this.selection.height);
                }
                
                // Фиксируем выделение (если размер больше 5 пикселей)
                if (Math.abs(this.selection.width) > 5 && Math.abs(this.selection.height) > 5) {
                    // Копируем выделенную область
                    this.copySelectionToBuffer();
                    this.drawSelection();
                } else {
                    // Слишком маленькое выделение - очищаем
                    this.clearSelection();
                }
            }
        } else if (this.currentTool === 'line' && this.lineStartPoint && coords) {
            // Очищаем предпросмотр
            pageData.linePreviewContext.clearRect(0, 0, 800, 1120);

            // Рисуем окончательную линию на drawing canvas
            pageData.drawingContext.strokeStyle = this.currentColor;
            pageData.drawingContext.lineWidth = this.brushSize;
            pageData.drawingContext.lineCap = 'round';
            pageData.drawingContext.beginPath();
            pageData.drawingContext.moveTo(this.lineStartPoint.x, this.lineStartPoint.y);
            pageData.drawingContext.lineTo(coords.x, coords.y);
            pageData.drawingContext.stroke();

            this.lineStartPoint = null;
            this.updatePageDisplay(this.currentPageId);
        }

        this.isDrawing = false;
        this.isPointerDownOnCanvas = false;
        
        // Сохраняем только если не в режиме выделения
        if (this.currentTool !== 'selection') {
            this.saveCurrentPage();
        }

        // Восстанавливаем возможность выделения текста
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
    };

    handlePointerLeave = (e: MouseEvent | TouchEvent | PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        this.isDrawing = false;
        this.isPointerDownOnCanvas = false;

        if (this.currentTool === 'line' && this.lineStartPoint) {
            const pageData = this.pageMap.get(this.currentPageId);
            if (pageData) {
                pageData.linePreviewContext.clearRect(0, 0, 800, 1120);
                this.updatePageDisplay(this.currentPageId);
            }
            this.lineStartPoint = null;
        }

        // Восстанавливаем возможность выделения текста
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
    };

    handlePointerEnter = (e: MouseEvent | PointerEvent) => {
        // Обновляем курсор при входе на canvas
        this.updateCursorForCurrentTool();
    };

    // МЕТОДЫ ДЛЯ ИНСТРУМЕНТА ВЫДЕЛЕНИЯ

    drawSelection() {
        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        pageData.selectionContext.clearRect(0, 0, 800, 1120);

        const x = Math.min(this.selection.x, this.selection.x + this.selection.width);
        const y = Math.min(this.selection.y, this.selection.y + this.selection.height);
        const w = Math.abs(this.selection.width);
        const h = Math.abs(this.selection.height);

        if (w < 2 || h < 2) {
            this.updateDisplayWithSelection();
            return;
        }

        const ctx = pageData.selectionContext;

        // Рисуем содержимое выделения, если оно есть
        if (this.selection.imageData) {
            ctx.putImageData(this.selection.imageData, x, y);
        }

        // РИСУЕМ РАМКУ
        ctx.save();
        ctx.strokeStyle = '#2196F3';
        ctx.setLineDash([5, 5]); // Пунктирная линия
        ctx.lineWidth = 2;
        // Используем Math.floor + 0.5 для идеальной четкости линии в 1 пиксель
        ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(w), Math.floor(h));
        
        // Углы (маркеры)
        ctx.setLineDash([]); // Сплошная линия для углов
        ctx.fillStyle = '#2196F3';
        const s = 6; // размер маркера
        ctx.fillRect(x - s/2, y - s/2, s, s);
        ctx.fillRect(x + w - s/2, y - s/2, s, s);
        ctx.fillRect(x - s/2, y + h - s/2, s, s);
        ctx.fillRect(x + w - s/2, y + h - s/2, s, s);
        ctx.restore();

        this.updateDisplayWithSelection();
    }

    updateDisplayWithSelection() {
        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        // Очищаем основной canvas
        pageData.context.clearRect(0, 0, 800, 1120);

        const page = this.pages.find(p => p.id === this.currentPageId);
        if (page) {
            this.drawBackground(pageData.context, page.pageStyle);
        }

        // Рисуем основной рисунок
        pageData.context.drawImage(pageData.drawingCanvas, 0, 0);
        
        // Рисуем выделение поверх
        pageData.context.drawImage(pageData.selectionCanvas, 0, 0);
        
        // Рисуем предпросмотр линии если есть
        pageData.context.drawImage(pageData.linePreviewCanvas, 0, 0);
    }

    copySelectionToBuffer() {
        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData || Math.abs(this.selection.width) <= 0 || Math.abs(this.selection.height) <= 0) return;

        // Определяем реальные координаты для копирования
        const x = Math.min(this.selection.x, this.selection.x + this.selection.width);
        const y = Math.min(this.selection.y, this.selection.y + this.selection.height);
        const width = Math.abs(this.selection.width);
        const height = Math.abs(this.selection.height);

        // Копируем выделенную область из основного рисунка
        this.selection.imageData = pageData.drawingContext.getImageData(
            x,
            y,
            width,
            height
        );
    }

    copySelection() {
        if (!this.selection.imageData || this.selection.width <= 0 || this.selection.height <= 0) {
            return;
        }

        // Сохраняем в буфер обмена
        this.clipboard = {
            imageData: this.selection.imageData,
            width: this.selection.width,
            height: this.selection.height
        };

        console.log('Выделение скопировано в буфер');
    }

    cutSelection() {
        if (!this.selection.imageData || this.selection.width <= 0 || this.selection.height <= 0) {
            return;
        }

        // Копируем в буфер
        this.copySelection();
        
        // Удаляем выделенную область
        this.deleteSelection();
    }

    pasteFromClipboard() {
        if (!this.clipboard || !this.clipboard.imageData) {
            console.log('Буфер обмена пуст');
            return;
        }

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        // Позиция для вставки - рядом с текущим курсором или в центре если нет выделения
        let pasteX = 400;
        let pasteY = 560;
        
        // Если есть текущее выделение, вставляем рядом с ним
        if (this.selection.imageData) {
            pasteX = this.selection.x + this.selection.width + 10;
            pasteY = this.selection.y;
            
            // Если выходит за границы, перемещаем в начало строки ниже
            if (pasteX + this.clipboard.width > 800) {
                pasteX = 10;
                pasteY = this.selection.y + this.selection.height + 10;
            }
            
            // Проверяем границы canvas
            if (pasteY + this.clipboard.height > 1120) {
                pasteY = 10;
            }
        }

        // Создаем новое выделение для вставленного изображения
        this.selection.x = pasteX;
        this.selection.y = pasteY;
        this.selection.width = this.clipboard.width;
        this.selection.height = this.clipboard.height;
        this.selection.imageData = this.clipboard.imageData;
        this.selection.isSelecting = false;
        this.selection.isMoving = false;

        // Переключаемся на инструмент выделения
        const selectionBtn = this.toolbar.querySelector('.tool-btn:nth-child(4)') as HTMLButtonElement;
        if (selectionBtn) {
            const brushBtn = this.toolbar.querySelector('.tool-btn:nth-child(1)') as HTMLButtonElement;
            const eraserBtn = this.toolbar.querySelector('.tool-btn:nth-child(2)') as HTMLButtonElement;
            const lineBtn = this.toolbar.querySelector('.tool-btn:nth-child(3)') as HTMLButtonElement;
            
            this.setActiveTool('selection', brushBtn, eraserBtn, lineBtn, selectionBtn);
        }

        // Рисуем выделение
        this.drawSelection();
        
        console.log('Вставлено из буфера');
    }


    deleteSelection() {
        if (!this.selection.imageData || this.selection.width <= 0 || this.selection.height <= 0) {
            return;
        }

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        // Очищаем выделенную область на основном рисунке
        pageData.drawingContext.clearRect(
            this.selection.x,
            this.selection.y,
            this.selection.width,
            this.selection.height
        );

        // Очищаем выделение
        this.clearSelection();
        
        // Обновляем отображение
        this.updatePageDisplay(this.currentPageId);
        
        // Сохраняем изменения
        this.saveCurrentPage();
        
        console.log('Выделение удалено');
    }

    applySelection() {
        if (!this.selection.imageData || this.selection.width <= 0 || this.selection.height <= 0) {
            return;
        }

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        // Вставляем только непрозрачные пиксели (фон не перезаписываем)
        this.drawImageData(pageData.drawingContext, this.selection.imageData, this.selection.x, this.selection.y);

        // Очищаем выделение
        this.clearSelection();
        
        // Обновляем отображение
        this.updatePageDisplay(this.currentPageId);
        
        // Сохраняем изменения
        this.saveCurrentPage();
        
        console.log('Выделение применено');
    }

    applyMovedSelection() {
        if (!this.selection.imageData || this.selection.width <= 0 || this.selection.height <= 0) {
            return;
        }

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        // Вставляем только непрозрачные пиксели (фон не перезаписываем)
        this.drawImageData(
            pageData.drawingContext,
            this.selection.imageData,
            Math.round(this.selection.x),
            Math.round(this.selection.y)
        );

        // Просто снимаем выделение (оставляем изображение на месте)
        this.clearSelection();
        
        // Обновляем отображение
        this.updatePageDisplay(this.currentPageId);
        
        // Сохраняем изменения
        this.saveCurrentPage();
        
        console.log('Перемещенное выделение применено');
    }

    clearSelection() {
        this.selection = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            imageData: null,
            isSelecting: false,
            isMoving: false,
            offsetX: 0,
            offsetY: 0
        };

        // Очищаем canvas выделения
        const pageData = this.pageMap.get(this.currentPageId);
        if (pageData) {
            pageData.selectionContext.clearRect(0, 0, 800, 1120);
            this.updatePageDisplay(this.currentPageId);
        }
        
        console.log('Выделение снято');
    }

    private drawImageData(
        context: CanvasRenderingContext2D,
        imageData: ImageData,
        x: number,
        y: number
    ) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempContext = tempCanvas.getContext('2d');
        if (!tempContext) return;

        tempContext.putImageData(imageData, 0, 0);
        context.drawImage(tempCanvas, x, y);
    }

    showLinePreview(x1: number, y1: number, x2: number, y2: number) {
        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        this.lastPreviewX = x2;
        this.lastPreviewY = y2;

        // Очищаем canvas предпросмотра
        pageData.linePreviewContext.clearRect(0, 0, 800, 1120);

        // Рисуем одну линию предпросмотра
        pageData.linePreviewContext.strokeStyle = this.currentColor;
        pageData.linePreviewContext.lineWidth = this.brushSize;
        pageData.linePreviewContext.lineCap = 'round';
        pageData.linePreviewContext.setLineDash([5, 5]);
        pageData.linePreviewContext.beginPath();
        pageData.linePreviewContext.moveTo(x1, y1);
        pageData.linePreviewContext.lineTo(x2, y2);
        pageData.linePreviewContext.stroke();
        pageData.linePreviewContext.setLineDash([]);

        // Обновляем отображение
        this.updateDisplayWithSelection();
    }

    updatePageDisplay(pageId: string) {
        const pageData = this.pageMap.get(pageId);
        if (!pageData) return;

        pageData.context.clearRect(0, 0, 800, 1120);

        const page = this.pages.find(p => p.id === pageId);
        if (page) {
            this.drawBackground(pageData.context, page.pageStyle);
        }

        pageData.context.drawImage(pageData.drawingCanvas, 0, 0);
        pageData.linePreviewContext.clearRect(0, 0, 800, 1120);
    }

    drawFreehand(x: number, y: number) {
        if (!this.isDrawing) return;

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        // Рисуем на drawing canvas
        if (this.currentTool === 'eraser') {
            pageData.drawingContext.globalCompositeOperation = 'destination-out';
            pageData.drawingContext.lineWidth = this.eraserSize;
        } else {
            pageData.drawingContext.globalCompositeOperation = 'source-over';
            pageData.drawingContext.strokeStyle = this.currentColor;
            pageData.drawingContext.lineWidth = this.brushSize;
        }

        pageData.drawingContext.lineCap = 'round';
        pageData.drawingContext.lineJoin = 'round';
        pageData.drawingContext.lineTo(x, y);
        pageData.drawingContext.stroke();

        // Восстанавливаем начало пути для продолжения рисования
        pageData.drawingContext.beginPath();
        pageData.drawingContext.moveTo(x, y);

        // Восстанавливаем нормальную композицию
        pageData.drawingContext.globalCompositeOperation = 'source-over';

        // Обновляем отображение
        this.updatePageDisplay(this.currentPageId);
    }

    switchToPage(pageId: string) {
        if (this.currentPageId === pageId) {
            return;
        }

        // Сохраняем текущую страницу
        this.saveCurrentPage();

        // Сбрасываем состояние рисования
        this.isDrawing = false;
        this.isPointerDownOnCanvas = false;
        this.lineStartPoint = null;
        
        // Сбрасываем выделение
        this.clearSelection();

        // Снимаем активность со всех страниц
        this.pages.forEach(p => p.isActive = false);
        this.pagesContainer.querySelectorAll('.canvas-page-container').forEach(el => {
            const htmlEl = el as HTMLElement;
            htmlEl.classList.remove('active');
            const title = htmlEl.querySelector('.page-title') as HTMLElement;
            if (title) {
                title.style.cursor = 'pointer';
            }
            htmlEl.style.cursor = 'pointer';
        });

        // Снимаем активность со всех вкладок
        this.tabsContainer.querySelectorAll('.drawing-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Устанавливаем новую активную страницу
        this.currentPageId = pageId;

        // Обновляем активность в массиве
        const page = this.pages.find(p => p.id === pageId);
        if (page) {
            page.isActive = true;
            this.pageStyle = page.pageStyle;
        }

        // Обновляем DOM страницы
        const pageElement = this.pagesContainer.querySelector(`[data-page-id="${pageId}"]`) as HTMLElement;
        if (pageElement) {
            pageElement.classList.add('active');
            pageElement.style.cursor = 'default';
            const title = pageElement.querySelector('.page-title') as HTMLElement;
            if (title) {
                title.style.cursor = 'default';
            }
        }

        // Обновляем активную вкладку
        const activeTab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${pageId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Обновляем ссылки на canvas и context
        const pageData = this.pageMap.get(pageId);
        if (pageData) {
            // Удаляем обработчики со старого canvas
            this.removeCanvasEventListeners();

            // Устанавливаем новый canvas
            this.canvas = pageData.canvas;
            this.context = pageData.context;

            // Добавляем обработчики на новый canvas
            this.setupCanvasEventListeners(this.canvas);

            // Восстанавливаем рисунок если есть
            if (page?.drawingData) {
                this.loadDrawingData(pageId, page.drawingData);
            } else {
                // Просто обновляем отображение
                this.updatePageDisplay(pageId);
            }
            // Обновляем курсор для текущего инструмента
            this.updateCursorForCurrentTool();
        }

        // Обновляем стиль страницы в интерфейсе
        this.updatePageStyleSelect();
    }

    // Новый метод для обновления курсора
    updateCursorForCurrentTool() {
        if (!this.canvas) return;

        // Удаляем все классы курсоров
        this.canvas.classList.remove('brush-cursor', 'eraser-cursor', 'line-cursor', 'selection-cursor');

        switch (this.currentTool) {
            case 'brush':
                this.canvas.classList.add('brush-cursor');
                this.canvas.style.cursor = 'auto';
                break;
            case 'eraser':
                this.canvas.classList.add('eraser-cursor');
                this.canvas.style.cursor = 'auto';
                break;
            case 'line':
                this.canvas.classList.add('line-cursor');
                this.canvas.style.cursor = 'auto';
                break;
            case 'selection':
                this.canvas.classList.add('selection-cursor');
                this.canvas.style.cursor = 'crosshair';
                break;
        }
    }

    createTab(pageId: string, title: string, isActive: boolean = false) {
        const tab = this.tabsContainer.createEl('div', {
            cls: `drawing-tab ${isActive ? 'active' : ''}`,
            attr: { 'data-page-id': pageId }
        });

        tab.createEl('span', { text: title });

        const closeBtn = tab.createEl('button', {
            cls: 'tab-close-btn',
            text: '×'
        });

        // Переключение на вкладку
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target !== closeBtn) {
                this.switchToPage(pageId);
            }
        });

        // Закрытие вкладки
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePage(pageId);
        });
    }

    updatePageStyleSelect() {
        const page = this.pages.find(p => p.id === this.currentPageId);
        if (page) {
            this.pageStyle = page.pageStyle;
            const select = this.toolbar.querySelector('select');
            if (select) {
                (select as HTMLSelectElement).value = page.pageStyle;
            }
        }
    }

    saveCurrentPage() {
        const page = this.pages.find(p => p.id === this.currentPageId);
        const pageData = this.pageMap.get(this.currentPageId);

        if (page && pageData) {
            // Сохраняем только рисунок (без фона)
            page.drawingData = pageData.drawingCanvas.toDataURL('image/png');
            page.pageStyle = this.pageStyle;
        }
    }

    loadDrawingData(pageId: string, dataUrl: string) {
        const pageData = this.pageMap.get(pageId);
        if (!pageData) return;

        const img = new Image();
        img.onload = () => {
            // Очищаем drawing canvas
            pageData.drawingContext.clearRect(0, 0, 800, 1120);

            // Рисуем сохраненное изображение
            pageData.drawingContext.drawImage(img, 0, 0);

            // Обновляем отображение
            this.updatePageDisplay(pageId);
        };
        img.src = dataUrl;
    }

    redrawPageBackground(pageId: string) {
        const pageData = this.pageMap.get(pageId);
        const page = this.pages.find(p => p.id === pageId);

        if (pageData && page) {
            // Очищаем основной canvas
            pageData.context.clearRect(0, 0, 800, 1120);

            // Рисуем новый фон
            this.drawBackground(pageData.context, page.pageStyle);

            // Рисуем рисунок поверх фона
            pageData.context.drawImage(pageData.drawingCanvas, 0, 0);
        }
    }

    // МЕТОДЫ ДЛЯ РИСОВАНИЯ ФОНА

    drawBackground(context: CanvasRenderingContext2D, style: 'blank' | 'grid' | 'dots') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 800, 1120);

        if (style === 'grid') {
            this.drawGrid(context);
        } else if (style === 'dots') {
            this.drawDots(context);
        }
    }

    drawGrid(context: CanvasRenderingContext2D) {
        context.strokeStyle = '#e0e0e0';
        context.lineWidth = 0.5;
        const cellSize = 20;

        // Вертикальные линии
        for (let x = 0; x <= 800; x += cellSize) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, 1120);
            context.stroke();
        }

        // Горизонтальные линии
        for (let y = 0; y <= 1120; y += cellSize) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(800, y);
            context.stroke();
        }
    }

    drawDots(context: CanvasRenderingContext2D) {
        context.fillStyle = '#e0e0e0';
        const spacing = 20;

        for (let x = spacing; x < 800; x += spacing) {
            for (let y = spacing; y < 1120; y += spacing) {
                context.beginPath();
                context.arc(x, y, 1, 0, Math.PI * 2);
                context.fill();
            }
        }
    }

    generatePageId(): string {
        return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async exportAllToPDF() {
        try {
            const jsPDF = await import('jspdf');
            const pdf = new jsPDF.default({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Экспортируем каждую страницу
            for (let i = 0; i < this.pages.length; i++) {
                const page = this.pages[i];

                // Если это не первая страница, добавляем новую страницу в PDF
                if (i > 0) {
                    pdf.addPage();
                }

                // Получаем canvas для этой страницы
                const pageData = this.pageMap.get(page.id);
                if (pageData) {
                    // Создаем финальное изображение (фон + рисунок)
                    const finalCanvas = document.createElement('canvas');
                    finalCanvas.width = 800;
                    finalCanvas.height = 1120;
                    const finalContext = finalCanvas.getContext('2d')!;

                    // Рисуем фон
                    this.drawBackground(finalContext, page.pageStyle);

                    // Рисуем рисунок
                    finalContext.drawImage(pageData.drawingCanvas, 0, 0);

                    const imgData = finalCanvas.toDataURL('image/png');
                    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
                }
            }

            // Сохраняем PDF
            const date = new Date().toISOString().split('T')[0];
            pdf.save(`рисовалка-${date}.pdf`);

            console.log('Все страницы успешно экспортированы в PDF');
        } catch (error) {
            console.error('Ошибка при экспорте в PDF:', error);
            alert('Ошибка при экспорте в PDF.');
        }
    }

    updatePagesDOMOrder() {
        // Удаляем все страницы из контейнера
        this.pagesContainer.empty();

        // Добавляем страницы в правильном порядке
        this.pages.forEach(page => {
            const pageData = this.pageMap.get(page.id);
            if (pageData) {
                // Создаем элемент страницы
                const pageContainer = this.pagesContainer.createDiv({
                    cls: `canvas-page-container ${page.isActive ? 'active' : ''}`,
                    attr: { 'data-page-id': page.id }
                });

                // Заголовок
                const titleEl = pageContainer.createEl('h3', {
                    text: page.name,
                    cls: 'page-title',
                    attr: {
                        'style': 'user-select: none; -webkit-user-select: none; -ms-user-select: none; -moz-user-select: none; cursor: pointer;'
                    }
                });

                // Canvas
                const canvas = pageContainer.createEl('canvas', {
                    cls: 'drawing-canvas',
                    attr: { 'style': 'touch-action: none;' }
                }) as HTMLCanvasElement;

                canvas.width = 800;
                canvas.height = 1120;

                // Восстанавливаем canvas из pageMap
                const existingPageData = this.pageMap.get(page.id);
                if (existingPageData) {
                    // Копируем содержимое
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(existingPageData.canvas, 0, 0);

                    // Заменяем canvas в pageMap
                    existingPageData.canvas = canvas;
                    existingPageData.context = canvas.getContext('2d', { willReadFrequently: true })!;

                    // Если это активная страница, обновляем ссылки
                    if (page.isActive) {
                        this.canvas = canvas;
                        this.context = existingPageData.context;
                        this.setupCanvasEventListeners(this.canvas);
                    }
                }

                // Обработчик клика
                pageContainer.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (page.id !== this.currentPageId) {
                        this.switchToPage(page.id);
                    }
                    return false;
                });
            }
        });
    }

    createNewPage(afterCurrent: boolean = true) {
        // Сохраняем текущий рисунок
        this.saveCurrentPage();

        // Увеличиваем счетчик
        this.pageCounter++;
        const newPageId = this.generatePageId();
        const newPageTitle = `Страница ${this.pageCounter}`;

        // Находим индекс текущей страницы
        const currentIndex = this.pages.findIndex(p => p.id === this.currentPageId);

        // Создаем новую страницу
        const newPage: DrawingPage = {
            id: newPageId,
            name: newPageTitle,
            drawingData: null,
            pageStyle: this.pageStyle,
            createdAt: new Date(),
            isActive: false
        };

        // Добавляем страницу в массив в правильное место
        if (afterCurrent && currentIndex !== -1) {
            this.pages.splice(currentIndex + 1, 0, newPage);
        } else {
            this.pages.push(newPage);
        }

        // Создаем canvas для новой страницы
        this.createPageData(newPageId);

        // Обновляем порядок в DOM
        this.updatePagesDOMOrder();

        // Создаем вкладку
        this.createTab(newPageId, newPageTitle, false);

        // Переключаемся на новую страницу
        this.switchToPage(newPageId);
    }

    // Новый метод для создания данных страницы
    createPageData(pageId: string) {
        // Создаем canvas
        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.width = 800;
        drawingCanvas.height = 1120;
        const drawingContext = drawingCanvas.getContext('2d', { willReadFrequently: true })!;

        const linePreviewCanvas = document.createElement('canvas');
        linePreviewCanvas.width = 800;
        linePreviewCanvas.height = 1120;
        const linePreviewContext = linePreviewCanvas.getContext('2d')!;

        const selectionCanvas = document.createElement('canvas');
        selectionCanvas.width = 800;
        selectionCanvas.height = 1120;
        const selectionContext = selectionCanvas.getContext('2d')!;

        // Создаем временный canvas для страницы
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 800;
        tempCanvas.height = 1120;
        const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true })!;

        this.pageMap.set(pageId, {
            canvas: tempCanvas,
            context: tempContext,
            drawingCanvas,
            drawingContext,
            linePreviewCanvas,
            linePreviewContext,
            selectionCanvas,
            selectionContext
        });
    }

    closePage(pageId: string) {
        if (this.pages.length <= 1) {
            alert('Нельзя удалить последнюю страницу');
            return;
        }

        if (confirm('Удалить эту страницу?')) {
            // Находим индекс удаляемой страницы
            const pageIndex = this.pages.findIndex(p => p.id === pageId);

            // Запоминаем, нужно ли будет перенумеровывать страницы
            const needRenumber = pageIndex !== -1 && pageIndex < this.pages.length - 1;

            // Удаляем страницу из массива
            this.pages.splice(pageIndex, 1);

            // Удаляем из Map
            this.pageMap.delete(pageId);

            // Удаляем вкладку
            const tab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${pageId}"]`);
            if (tab) {
                tab.remove();
            }

            // Если удалили текущую страницу, переключаемся на предыдущую
            if (pageId === this.currentPageId) {
                const newPageId = this.pages[Math.max(0, pageIndex - 1)].id;
                this.switchToPage(newPageId);
            }

            // Обновляем порядок в DOM
            this.updatePagesDOMOrder();

            // Переименовываем страницы, если нужно
            if (needRenumber) {
                this.renumberPages();
            }

            // Обновляем счетчик
            this.pageCounter = this.pages.length;
        }
    }

    renumberPages() {
        this.pages.forEach((page, index) => {
            const newNumber = index + 1;
            const newName = `Страница ${newNumber}`;

            if (page.name !== newName) {
                page.name = newName;

                const pageEl = this.pagesContainer.querySelector(`[data-page-id="${page.id}"] .page-title`);
                if (pageEl) {
                    pageEl.textContent = newName;
                }

                const tab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${page.id}"] span`);
                if (tab) {
                    tab.textContent = newName;
                }
            }
        });
    }

    async onClose() {
        this.saveCurrentPage();
        this.isDrawing = false;
        this.lineStartPoint = null;
        this.clearSelection();

        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
        
        this.removeCanvasEventListeners();
    }
}