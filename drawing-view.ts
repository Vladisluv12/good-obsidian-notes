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

export class DrawingView extends ItemView {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private currentColor: string = '#000000';
    private currentTool: 'brush' | 'eraser' | 'line' = 'brush';
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
        linePreviewContext: CanvasRenderingContext2D
    }> = new Map();

    // Для предотвращения выделения текста и перетаскивания
    private isPointerDownOnCanvas: boolean = false;

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
        const colorPicker = this.toolbar.createEl('input', { type: 'color', value: this.currentColor });

        const brushSizeSelect = this.toolbar.createEl('select');
        brushSizeSelect.createEl('option', { value: '1', text: 'Тонкая' });
        brushSizeSelect.createEl('option', { value: '2', text: 'Средняя' });
        brushSizeSelect.createEl('option', { value: '4', text: 'Толстая' });
        brushSizeSelect.value = '2';

        const pageStyleSelect = this.toolbar.createEl('select');
        pageStyleSelect.createEl('option', { value: 'blank', text: 'Чистая' });
        pageStyleSelect.createEl('option', { value: 'grid', text: 'Клетка' });
        pageStyleSelect.createEl('option', { value: 'dots', text: 'Точки' });
        pageStyleSelect.value = this.pageStyle;

        const newPageBtn = this.toolbar.createEl('button', { text: '+ Новая страница', cls: 'tool-btn new-page-btn' });
        const newPageEndBtn = this.toolbar.createEl('button', { text: '+ В конец', cls: 'tool-btn' });
        const exportBtn = this.toolbar.createEl('button', { text: '📄 Экспорт все в PDF', cls: 'tool-btn export-btn' });

        brushBtn.addEventListener('click', () => this.setActiveTool('brush', brushBtn, eraserBtn, lineBtn));
        eraserBtn.addEventListener('click', () => this.setActiveTool('eraser', brushBtn, eraserBtn, lineBtn));
        lineBtn.addEventListener('click', () => this.setActiveTool('line', brushBtn, eraserBtn, lineBtn));
        colorPicker.addEventListener('input', (e) => this.currentColor = (e.target as HTMLInputElement).value);
        brushSizeSelect.addEventListener('change', (e) => this.brushSize = parseInt((e.target as HTMLSelectElement).value));

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
    }

    setActiveTool(tool: 'brush' | 'eraser' | 'line', brushBtn: HTMLButtonElement, eraserBtn: HTMLButtonElement, lineBtn: HTMLButtonElement) {
        this.currentTool = tool;
        brushBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        lineBtn.classList.remove('active');

        if (tool === 'brush') brushBtn.classList.add('active');
        else if (tool === 'eraser') eraserBtn.classList.add('active');
        else if (tool === 'line') lineBtn.classList.add('active');

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

        this.pageMap.set(pageId, { canvas, context, drawingCanvas, drawingContext, linePreviewCanvas, linePreviewContext });
        this.drawBackground(context, this.pageStyle);

        if (isActive) {
            this.canvas = canvas;
            this.context = context;
            this.setupCanvasEventListeners(canvas);
        }

        // Обработчик для переключения страниц - только для НЕ активных страниц
        if (!isActive) {
            // console.log(`[Drawing] Создаю неактивную страницу: ${pageId} (${title})`);
            pageContainer.addEventListener('click', (e) => {
                // console.log(`[Drawing] Клик по контейнеру неактивной страницы: ${pageId}`);
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
                // console.log(`[Drawing] Клик по контейнеру АКТИВНОЙ страницы: ${pageId}. Цель клика:`, e.target);
                // Если клик не на canvas, всё равно предотвращаем выделение
                if (e.target !== canvas) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            });

            pageContainer.addEventListener('touchstart', (e) => {
                // console.log(`[Drawing] Клик по контейнеру АКТИВНОЙ страницы: ${pageId}. Цель клика:`, e.target);
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

    setupCanvasEventListeners(canvas: HTMLCanvasElement) {
        // Удаляем старые обработчики если они есть
        this.removeCanvasEventListeners();

        // МЫШЬ
        canvas.addEventListener('mousedown', this.handlePointerStart);
        canvas.addEventListener('mousemove', this.handlePointerMove);
        canvas.addEventListener('mouseup', this.handlePointerEnd);
        canvas.addEventListener('mouseleave', this.handlePointerLeave);

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
        } else if (e instanceof TouchEvent) {
            if (e.touches.length === 0) return null;
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if ('clientX' in e && 'clientY' in e) {
            clientX = (e as any).clientX;
            clientY = (e as any).clientY;
        } else {
            return null;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
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

        if (this.currentTool === 'line') {
            this.lineStartPoint = { x: this.lastX, y: this.lastY };
        } else {
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

        if (this.currentTool === 'line' && this.lineStartPoint) {
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

        if (this.currentTool === 'line' && this.lineStartPoint && coords) {
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
        this.saveCurrentPage();

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
        this.updateDisplayWithPreview();
    }

    updateDisplayWithPreview() {
        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        pageData.context.clearRect(0, 0, 800, 1120);

        const page = this.pages.find(p => p.id === this.currentPageId);
        if (page) {
            this.drawBackground(pageData.context, page.pageStyle);
        }

        pageData.context.drawImage(pageData.drawingCanvas, 0, 0);
        pageData.context.drawImage(pageData.linePreviewCanvas, 0, 0);
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
            // console.log(`[Drawing] Переключение отменено: это уже текущая страница`);
            return;
        }

        // Сохраняем текущую страницу
        this.saveCurrentPage();

        // Сбрасываем состояние рисования
        this.isDrawing = false;
        this.isPointerDownOnCanvas = false;
        this.lineStartPoint = null;

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
        }

        // Обновляем стиль страницы в интерфейсе
        this.updatePageStyleSelect();
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

        // Добавляем страницу в массив
        if (afterCurrent && currentIndex !== -1) {
            this.pages.splice(currentIndex + 1, 0, newPage);

            // Находим DOM-элемент текущей страницы
            const currentPageEl = this.pagesContainer.querySelector(`[data-page-id="${this.currentPageId}"]`);
            if (currentPageEl) {
                // Создаем DOM-элемент после текущей
                this.createPageElementAfter(newPageId, newPageTitle, currentPageEl);
            } else {
                this.createPageElement(newPageId, newPageTitle, false);
            }
        } else {
            this.pages.push(newPage);
            this.createPageElement(newPageId, newPageTitle, false);
        }

        // Переключаемся на новую страницу
        this.switchToPage(newPageId);
    }

    createPageElementAfter(pageId: string, title: string, afterElement: Element) {
        // Создаем новый элемент
        const pageContainer = this.pagesContainer.createDiv({
            cls: 'canvas-page-container',
            attr: { 'data-page-id': pageId }
        });

        // Заголовок страницы
        const titleEl = pageContainer.createEl('h3', {
            text: title,
            cls: 'page-title'
        });

        // Создаем canvas
        const canvas = pageContainer.createEl('canvas', {
            cls: 'drawing-canvas'
        }) as HTMLCanvasElement;

        canvas.width = 800;
        canvas.height = 1120;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;

        // Создаем отдельный canvas для рисунка
        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.width = 800;
        drawingCanvas.height = 1120;
        const drawingContext = drawingCanvas.getContext('2d', { willReadFrequently: true })!;

        // Создаем canvas для предпросмотра линии
        const linePreviewCanvas = document.createElement('canvas');
        linePreviewCanvas.width = 800;
        linePreviewCanvas.height = 1120;
        const linePreviewContext = linePreviewCanvas.getContext('2d')!;

        // Сохраняем ссылки
        this.pageMap.set(pageId, { canvas, context, drawingCanvas, drawingContext, linePreviewCanvas, linePreviewContext });

        // Рисуем фон
        this.drawBackground(context, this.pageStyle);

        // Добавляем обработчик клика на страницу
        pageContainer.addEventListener('click', (e) => {
            if (pageId !== this.currentPageId) {
                this.switchToPage(pageId);
            }
        });

        // Добавляем индикатор кликабельности
        pageContainer.style.cursor = 'pointer';
        titleEl.style.cursor = 'pointer';

        // Вставляем после указанного элемента
        afterElement.insertAdjacentElement('afterend', pageContainer);

        // Создаем вкладку
        this.createTab(pageId, title, false);
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

    // МЕТОДЫ ДЛЯ РИСОВАНИЯ

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

    handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return; // Только левая кнопка мыши

        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        if (this.currentTool === 'line') {
            this.lineStartPoint = { x: this.lastX, y: this.lastY };
        } else {
            this.isDrawing = true;

            // Начинаем новый путь на drawing canvas
            pageData.drawingContext.beginPath();
            pageData.drawingContext.moveTo(this.lastX, this.lastY);

            // Сразу рисуем точку для коротких кликов
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
    };

    handleMouseMove = (e: MouseEvent) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        if (this.currentTool === 'line' && this.lineStartPoint) {
            // Показываем предпросмотр линии
            this.showLinePreview(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
        } else if (this.isDrawing) {
            this.drawFreehand(x, y);
        }
    };

    handleMouseUp = (e: MouseEvent) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pageData = this.pageMap.get(this.currentPageId);
        if (!pageData) return;

        if (this.currentTool === 'line' && this.lineStartPoint) {
            // Рисуем окончательную линию на drawing canvas
            pageData.drawingContext.strokeStyle = this.currentColor;
            pageData.drawingContext.lineWidth = this.brushSize;
            pageData.drawingContext.lineCap = 'round';
            pageData.drawingContext.beginPath();
            pageData.drawingContext.moveTo(this.lineStartPoint.x, this.lineStartPoint.y);
            pageData.drawingContext.lineTo(x, y);
            pageData.drawingContext.stroke();

            this.lineStartPoint = null;

            // Обновляем отображение
            this.updatePageDisplay(this.currentPageId);
        }

        this.isDrawing = false;
        this.saveCurrentPage(); // Автосохранение
    };

    handleMouseLeave = (e: MouseEvent) => {
        this.isDrawing = false;
        this.lineStartPoint = null;
    };

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

    closePage(pageId: string) {
        if (this.pages.length <= 1) {
            alert('Нельзя удалить последнюю страницу');
            return;
        }

        if (confirm('Удалить эту страницу?')) {
            // Удаляем страницу из массива
            const pageIndex = this.pages.findIndex(p => p.id === pageId);
            if (pageIndex !== -1) {
                this.pages.splice(pageIndex, 1);
            }

            // Удаляем из Map
            this.pageMap.delete(pageId);

            // Удаляем вкладку
            const tab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${pageId}"]`);
            if (tab) {
                tab.remove();
            }

            // Удаляем DOM-элемент страницы
            const pageEl = this.pagesContainer.querySelector(`[data-page-id="${pageId}"]`);
            if (pageEl) {
                pageEl.remove();
            }

            // Если удалили текущую страницу, переключаемся на предыдущую
            if (pageId === this.currentPageId) {
                const newPageId = this.pages[Math.max(0, pageIndex - 1)].id;
                this.switchToPage(newPageId);
            }

            // Пересчитываем номера страниц
            this.renumberPages();
        }
    }

    renumberPages() {
        this.pages.forEach((page, index) => {
            const newNumber = index + 1;
            const newName = `Страница ${newNumber}`;
            page.name = newName;

            // Обновляем текст в заголовке страницы
            const pageEl = this.pagesContainer.querySelector(`[data-page-id="${page.id}"] .page-title`);
            if (pageEl) {
                pageEl.textContent = newName;
            }

            // Обновляем текст вкладки
            const tab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${page.id}"] span`);
            if (tab) {
                tab.textContent = newName;
            }
        });
        this.pageCounter = this.pages.length;
    }

    async onClose() {
        // Сохраняем все страницы перед закрытием
        this.saveCurrentPage();
        this.isDrawing = false;
        this.lineStartPoint = null;
    }
}