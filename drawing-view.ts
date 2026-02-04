// drawing-view.ts - представление для рисования
import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_DRAWING = 'drawing-canvas-view';

interface DrawingPage {
    id: string;
    name: string;
    canvasData: string | null;
    pageStyle: 'blank' | 'grid' | 'dots';
    createdAt: Date;
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
    private lineStartPoint: { x: number, y: number } | null = null;
    private pageStyle: 'blank' | 'grid' | 'dots' = 'grid';
    private savedImageData: ImageData | null = null;
    private toolbar: HTMLElement;
    private pagesContainer: HTMLElement;
    private tabsContainer: HTMLElement;
    private currentPageId: string;
    private pages: DrawingPage[] = [];
    private pageCounter: number = 1;
    private pageMap: Map<string, HTMLCanvasElement> = new Map();
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
        // Основной контейнер
        const mainContainer = container.createDiv({ cls: 'drawing-main-container' });

        // Панель вкладок
        this.tabsContainer = mainContainer.createDiv({ cls: 'drawing-tabs-container' });

        // Панель инструментов
        this.toolbar = mainContainer.createDiv({ cls: 'drawing-toolbar' });

        // Контейнер для страниц
        this.pagesContainer = mainContainer.createDiv({ cls: 'drawing-pages-container' });

        // Создаем интерфейс инструментов
        this.createToolbar();

        // Создаем контейнер для текущего холста
        this.createCanvasContainer();
    }

    createToolbar() {
        // Кнопки инструментов
        const brushBtn = this.toolbar.createEl('button', {
            text: 'Кисть',
            cls: 'tool-btn active'
        });

        const eraserBtn = this.toolbar.createEl('button', {
            text: 'Ластик',
            cls: 'tool-btn'
        });

        const lineBtn = this.toolbar.createEl('button', {
            text: 'Линия',
            cls: 'tool-btn'
        });

        // Выбор цвета
        const colorPicker = this.toolbar.createEl('input', {
            type: 'color',
            value: this.currentColor
        });

        // Выбор размера кисти
        const brushSizeSelect = this.toolbar.createEl('select');
        brushSizeSelect.createEl('option', { value: '1', text: 'Тонкая' });
        brushSizeSelect.createEl('option', { value: '2', text: 'Средняя' });
        brushSizeSelect.createEl('option', { value: '4', text: 'Толстая' });

        // Выбор стиля страницы
        const pageStyleSelect = this.toolbar.createEl('select');
        pageStyleSelect.createEl('option', { value: 'blank', text: 'Чистая' });
        pageStyleSelect.createEl('option', { value: 'grid', text: 'Клетка' });
        pageStyleSelect.createEl('option', { value: 'dots', text: 'Точки' });
        pageStyleSelect.value = this.pageStyle;

        // Кнопка новой страницы (под текущей)
        const newPageBtn = this.toolbar.createEl('button', {
            text: '+ Новая страница',
            cls: 'tool-btn new-page-btn'
        });

        // Кнопка новой страницы (в конце)
        const newPageEndBtn = this.toolbar.createEl('button', {
            text: '+ В конец',
            cls: 'tool-btn'
        });

        const exportBtn = this.toolbar.createEl('button', {
            text: '📄 Экспорт все в PDF',
            cls: 'tool-btn export-btn'
        });

        // Обработчики событий для кнопок
        this.setupButtonListeners(
            brushBtn, eraserBtn, lineBtn, colorPicker,
            brushSizeSelect, pageStyleSelect, newPageBtn, newPageEndBtn, exportBtn
        );
    }

    createCanvasContainer() {
        // Контейнер для текущего холста
        const canvasContainer = this.pagesContainer.createDiv({
            cls: 'canvas-page-container',
            attr: { 'data-page-id': this.currentPageId }
        });

        canvasContainer.createEl('h3', {
            text: `Страница ${this.pageCounter}`,
            cls: 'page-title'
        });

        this.canvas = canvasContainer.createEl('canvas', {
            cls: 'drawing-canvas'
        }) as HTMLCanvasElement;

        (this.canvas as any).willReadFrequently = true;
        this.canvas.width = 800;
        this.canvas.height = 1120; // A4 пропорции
        this.context = this.canvas.getContext('2d')!;

        // Сохраняем ссылку на canvas
        this.pageMap.set(this.currentPageId, this.canvas);

        // Рисуем фон
        this.drawBackground(this.pageStyle);

        // Создаем запись о странице
        this.pages.push({
            id: this.currentPageId,
            name: `Страница ${this.pageCounter}`,
            canvasData: null,
            pageStyle: this.pageStyle,
            createdAt: new Date()
        });

        // Создаем вкладку для этой страницы
        this.createTab(this.currentPageId, `Страница ${this.pageCounter}`);

        // Обработчики событий для canvas
        this.setupCanvasEventListeners();
    }

    createTab(pageId: string, title: string) {
        const tab = this.tabsContainer.createEl('div', {
            cls: 'drawing-tab',
            attr: { 'data-page-id': pageId }
        });

        tab.createEl('span', { text: title });

        const closeBtn = tab.createEl('button', {
            cls: 'tab-close-btn',
            text: '×'
        });

        // Переключение на вкладку
        tab.addEventListener('click', (e) => {
            if (e.target !== closeBtn) {
                this.switchToPage(pageId);
            }
        });

        // Закрытие вкладки
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePage(pageId);
        });

        // Делаем активной текущую вкладку
        this.updateActiveTab();
    }

    createInitialPage() {
        this.pageCounter = 1;
        this.currentPageId = this.generatePageId();
        this.createCanvasContainer();
    }

    createNewPage(afterCurrent: boolean = true) {
        // Сохраняем текущий рисунок
        this.saveCurrentPage();

        // Увеличиваем счетчик
        this.pageCounter++;
        const newPageId = this.generatePageId();

        // Создаем новую страницу
        const newPage: DrawingPage = {
            id: newPageId,
            name: `Страница ${this.pageCounter}`,
            canvasData: null,
            pageStyle: this.pageStyle,
            createdAt: new Date()
        };

        // Добавляем страницу в массив
        if (afterCurrent) {
            // Находим индекс текущей страницы
            const currentIndex = this.pages.findIndex(p => p.id === this.currentPageId);
            if (currentIndex !== -1) {
                this.pages.splice(currentIndex + 1, 0, newPage);
            } else {
                this.pages.push(newPage);
            }
        } else {
            this.pages.push(newPage);
        }

        // Создаем вкладку
        this.createTab(newPageId, `Страница ${this.pageCounter}`);

        // Переключаемся на новую страницу
        this.switchToPage(newPageId);

        // Обновляем отображение страниц
        this.renderPages();
    }

    switchToPage(pageId: string) {
        // Сохраняем текущую страницу
        this.saveCurrentPage();

        // Обновляем текущую страницу
        this.currentPageId = pageId;

        // Находим страницу
        const page = this.pages.find(p => p.id === pageId);
        if (!page) return;

        // Обновляем стиль страницы
        this.pageStyle = page.pageStyle;

        // Обновляем активную вкладку
        this.updateActiveTab();

        // Перерисовываем страницы
        this.renderPages();
    }

    renderPages() {
        // Очищаем контейнер страниц
        this.pagesContainer.empty();

        // Создаем контейнер для каждой страницы
        this.pages.forEach((page, index) => {
            const pageContainer = this.pagesContainer.createDiv({
                cls: 'canvas-page-container',
                attr: { 'data-page-id': page.id }
            });

            if (page.id === this.currentPageId) {
                pageContainer.addClass('active');
            }

            // Заголовок страницы
            pageContainer.createEl('h3', {
                text: page.name,
                cls: 'page-title'
            });

            // Создаем canvas
            const canvas = pageContainer.createEl('canvas', {
                cls: 'drawing-canvas'
            }) as HTMLCanvasElement;

            (canvas as any).willReadFrequently = true;
            canvas.width = 800;
            canvas.height = 1120;
            const context = canvas.getContext('2d')!;

            // Сохраняем ссылку
            this.pageMap.set(page.id, canvas);

            // Восстанавливаем или рисуем фон
            if (page.id === this.currentPageId) {
                this.canvas = canvas;
                this.context = context;

                if (page.canvasData) {
                    // Загружаем сохраненные данные
                    this.loadCanvasFromData(page.canvasData);
                } else {
                    // Рисуем фон
                    this.drawBackground(page.pageStyle);
                }

                // Добавляем обработчики только для активного canvas
                this.setupCanvasEventListeners();
            } else {
                // Для неактивных страниц просто рисуем фон
                this.drawStaticPage(context, page);
            }
        });
    }

    drawStaticPage(context: CanvasRenderingContext2D, page: DrawingPage) {
        // Рисуем фон
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 800, 1120);

        if (page.pageStyle === 'grid') {
            this.drawGridOnContext(context);
        } else if (page.pageStyle === 'dots') {
            this.drawDotsOnContext(context);
        }

        // Если есть сохраненные данные, загружаем их
        if (page.canvasData) {
            this.loadCanvasDataToContext(context, page.canvasData);
        }
    }

    saveCurrentPage() {
        const page = this.pages.find(p => p.id === this.currentPageId);
        if (page && this.canvas) {
            // Сохраняем данные canvas как DataURL
            page.canvasData = this.canvas.toDataURL('image/png');
            page.pageStyle = this.pageStyle;
        }
    }

    loadCanvasFromData(dataUrl: string) {
        const img = new Image();
        img.onload = () => {
            // Сначала рисуем фон
            this.drawBackground(this.pageStyle);
            // Затем рисуем сохраненное изображение
            this.context.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    }

    loadCanvasDataToContext(context: CanvasRenderingContext2D, dataUrl: string) {
        const img = new Image();
        img.onload = () => {
            context.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    }

    setupButtonListeners(
        brushBtn: HTMLButtonElement,
        eraserBtn: HTMLButtonElement,
        lineBtn: HTMLButtonElement,
        colorPicker: HTMLInputElement,
        brushSizeSelect: HTMLSelectElement,
        pageStyleSelect: HTMLSelectElement,
        newPageBtn: HTMLButtonElement,
        newPageEndBtn: HTMLButtonElement,
        exportBtn: HTMLButtonElement
    ) {
        // Кисть
        brushBtn.addEventListener('click', () => {
            this.setActiveTool('brush', brushBtn, eraserBtn, lineBtn);
        });

        // Ластик
        eraserBtn.addEventListener('click', () => {
            this.setActiveTool('eraser', brushBtn, eraserBtn, lineBtn);
        });

        // Линия
        lineBtn.addEventListener('click', () => {
            this.setActiveTool('line', brushBtn, eraserBtn, lineBtn);
        });

        // Цвет
        colorPicker.addEventListener('input', (e) => {
            this.currentColor = (e.target as HTMLInputElement).value;
        });

        // Размер кисти
        brushSizeSelect.addEventListener('change', (e) => {
            this.brushSize = parseInt((e.target as HTMLSelectElement).value);
        });

        // Стиль страницы
        pageStyleSelect.addEventListener('change', (e) => {
            this.pageStyle = (e.target as HTMLSelectElement).value as 'blank' | 'grid' | 'dots';
            this.saveCurrentPage();

            // Обновляем стиль текущей страницы
            const page = this.pages.find(p => p.id === this.currentPageId);
            if (page) {
                page.pageStyle = this.pageStyle;
            }

            this.drawBackground(this.pageStyle);
            this.restoreDrawing();
        });

        // Новая страница (после текущей)
        newPageBtn.addEventListener('click', () => {
            this.createNewPage(true);
        });

        // Новая страница (в конец)
        newPageEndBtn.addEventListener('click', () => {
            this.createNewPage(false);
        });

        // Экспорт всех страниц в один PDF
        exportBtn.addEventListener('click', () => {
            this.exportAllToPDF();
        });
    }

    updateActiveTab() {
        // Убираем активный класс у всех вкладок
        this.tabsContainer.querySelectorAll('.drawing-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Добавляем активный класс текущей вкладке
        const activeTab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${this.currentPageId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
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
            page.name = `Страница ${index + 1}`;

            // Обновляем текст вкладки
            const tab = this.tabsContainer.querySelector(`.drawing-tab[data-page-id="${page.id}"] span`);
            if (tab) {
                tab.textContent = page.name;
            }
        });
        this.pageCounter = this.pages.length;
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
                const canvas = this.pageMap.get(page.id);
                if (canvas) {
                    const imgData = canvas.toDataURL('image/png');
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

    // Остальные методы (drawBackground, drawGrid, drawDots, setupCanvasEventListeners и т.д.)
    // остаются такими же как в предыдущей версии, но работают с текущим this.canvas

    // ... [остальные методы из предыдущей версии] ...

    drawBackground(style: 'blank' | 'grid' | 'dots') {
        if (!this.context) return;

        this.context.fillStyle = '#ffffff';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (style === 'grid') {
            this.drawGrid();
        } else if (style === 'dots') {
            this.drawDots();
        }
    }

    drawGrid() {
        if (!this.context) return;

        this.context.strokeStyle = '#e0e0e0';
        this.context.lineWidth = 0.5;
        const cellSize = 20;

        // Вертикальные линии
        for (let x = 0; x <= this.canvas.width; x += cellSize) {
            this.context.beginPath();
            this.context.moveTo(x, 0);
            this.context.lineTo(x, this.canvas.height);
            this.context.stroke();
        }

        // Горизонтальные линии
        for (let y = 0; y <= this.canvas.height; y += cellSize) {
            this.context.beginPath();
            this.context.moveTo(0, y);
            this.context.lineTo(this.canvas.width, y);
            this.context.stroke();
        }
    }

    drawGridOnContext(context: CanvasRenderingContext2D) {
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

    drawDots() {
        if (!this.context) return;

        this.context.fillStyle = '#e0e0e0';
        const spacing = 20;

        for (let x = spacing; x < this.canvas.width; x += spacing) {
            for (let y = spacing; y < this.canvas.height; y += spacing) {
                this.context.beginPath();
                this.context.arc(x, y, 1, 0, Math.PI * 2);
                this.context.fill();
            }
        }
    }

    drawDotsOnContext(context: CanvasRenderingContext2D) {
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

    setupCanvasEventListeners() {
        // Удаляем старые обработчики
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);

        // Добавляем новые обработчики
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    handleMouseDown(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;

        if (this.currentTool === 'line') {
            this.lineStartPoint = { x: this.lastX, y: this.lastY };
            this.saveCurrentDrawing();
        } else {
            this.isDrawing = true;
            this.context.beginPath();
            this.context.moveTo(this.lastX, this.lastY);
        }
    }

    handleMouseMove(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.currentTool === 'line' && this.lineStartPoint) {
            this.restoreDrawing();
            this.drawPreviewLine(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
        } else if (this.isDrawing) {
            this.drawFreehand(x, y);
        }
    }

    handleMouseUp(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.currentTool === 'line' && this.lineStartPoint) {
            this.drawLine(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
            this.lineStartPoint = null;
            this.savedImageData = null;
        }

        this.isDrawing = false;
        this.saveCurrentPage(); // Автосохранение после рисования
    }

    handleMouseLeave() {
        this.isDrawing = false;
        this.lineStartPoint = null;
    }

    // ... [остальные методы рисования остаются без изменений] ...

    setActiveTool(tool: 'brush' | 'eraser' | 'line', brushBtn: HTMLButtonElement, eraserBtn: HTMLButtonElement, lineBtn: HTMLButtonElement) {
        this.currentTool = tool;

        brushBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        lineBtn.classList.remove('active');

        switch (tool) {
            case 'brush':
                brushBtn.classList.add('active');
                break;
            case 'eraser':
                eraserBtn.classList.add('active');
                break;
            case 'line':
                lineBtn.classList.add('active');
                break;
        }
    }

    drawFreehand(x: number, y: number) {
        if (!this.isDrawing) return;

        this.context.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
        this.context.lineWidth = this.currentTool === 'eraser' ? this.eraserSize : this.brushSize;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';

        this.context.lineTo(x, y);
        this.context.stroke();
        this.context.beginPath();
        this.context.moveTo(x, y);
    }

    drawPreviewLine(x1: number, y1: number, x2: number, y2: number) {
        this.context.strokeStyle = this.currentColor;
        this.context.lineWidth = this.brushSize;
        this.context.lineCap = 'round';
        this.context.setLineDash([5, 5]);
        this.context.beginPath();
        this.context.moveTo(x1, y1);
        this.context.lineTo(x2, y2);
        this.context.stroke();
        this.context.setLineDash([]);
    }

    drawLine(x1: number, y1: number, x2: number, y2: number) {
        this.context.strokeStyle = this.currentColor;
        this.context.lineWidth = this.brushSize;
        this.context.lineCap = 'round';
        this.context.beginPath();
        this.context.moveTo(x1, y1);
        this.context.lineTo(x2, y2);
        this.context.stroke();
    }

    saveCurrentDrawing() {
        if (this.canvas) {
            this.savedImageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    restoreDrawing() {
        if (this.savedImageData && this.context) {
            this.context.putImageData(this.savedImageData, 0, 0);
        }
    }

    async onClose() {
        // Сохраняем все страницы перед закрытием
        this.saveCurrentPage();
        this.isDrawing = false;
        this.lineStartPoint = null;
        this.savedImageData = null;
    }
}