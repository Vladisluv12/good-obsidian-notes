// drawing-view.ts - представление для рисования
// drawing-view.ts - представление для рисования
import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_DRAWING = 'drawing-canvas-view';

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
    constructor(leaf: WorkspaceLeaf, private plugin: any) {
        super(leaf);
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
    }

    createUI(container: HTMLElement) {
        // Панель инструментов
        this.toolbar = container.createDiv({ cls: 'drawing-toolbar' });

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

        // Кнопки действий
        const newPageBtn = this.toolbar.createEl('button', {
            text: 'Новая страница',
            cls: 'tool-btn'
        });

        const exportBtn = this.toolbar.createEl('button', {
            text: 'Экспорт в PDF',
            cls: 'tool-btn'
        });

        // Холст для рисования
        this.canvas = container.createEl('canvas', {
            cls: 'drawing-canvas'
        }) as HTMLCanvasElement;

        this.canvas.width = 800;
        this.canvas.height = 1120; // A4 пропорции
        this.context = this.canvas.getContext('2d')!;

        // Рисуем фон
        this.drawBackground(this.pageStyle);

        // Обработчики событий для кнопок
        this.setupButtonListeners(
            brushBtn, eraserBtn, lineBtn, colorPicker,
            brushSizeSelect, pageStyleSelect, newPageBtn, exportBtn
        );

        // Обработчики событий для canvas
        this.setupCanvasEventListeners();
    }

    setupButtonListeners(
        brushBtn: HTMLButtonElement,
        eraserBtn: HTMLButtonElement,
        lineBtn: HTMLButtonElement,
        colorPicker: HTMLInputElement,
        brushSizeSelect: HTMLSelectElement,
        pageStyleSelect: HTMLSelectElement,
        newPageBtn: HTMLButtonElement,
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
            this.saveCurrentDrawing();
            this.drawBackground(this.pageStyle);
            this.restoreDrawing();
        });

        // Новая страница
        newPageBtn.addEventListener('click', () => {
            if (confirm('Создать новую страницу? Текущий рисунок будет удален.')) {
                this.clearCanvas();
            }
        });

        // Экспорт в PDF
        exportBtn.addEventListener('click', () => {
            this.exportToPDF();
        });
    }

    setActiveTool(tool: 'brush' | 'eraser' | 'line', brushBtn: HTMLButtonElement, eraserBtn: HTMLButtonElement, lineBtn: HTMLButtonElement) {
        this.currentTool = tool;

        // Обновляем классы кнопок
        brushBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        lineBtn.classList.remove('active');

        switch (tool) {
            case 'brush':
                brushBtn.classList.add('active');
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'eraser':
                eraserBtn.classList.add('active');
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'line':
                lineBtn.classList.add('active');
                this.canvas.style.cursor = 'crosshair';
                break;
        }
    }

    setupCanvasEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.lastX = e.clientX - rect.left;
            this.lastY = e.clientY - rect.top;

            if (this.currentTool === 'line') {
                // Для линии сохраняем начальную точку
                this.lineStartPoint = { x: this.lastX, y: this.lastY };
                this.saveCurrentDrawing(); // Сохраняем текущий рисунок для предпросмотра
            } else {
                // Для кисти и ластика начинаем рисование
                this.isDrawing = true;
                this.context.beginPath();
                this.context.moveTo(this.lastX, this.lastY);
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.currentTool === 'line' && this.lineStartPoint) {
                // Предпросмотр линии
                this.restoreDrawing(); // Восстанавливаем сохраненный рисунок
                this.drawPreviewLine(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
            } else if (this.isDrawing) {
                this.drawFreehand(x, y);
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.currentTool === 'line' && this.lineStartPoint) {
                // Завершаем рисование линии
                this.drawLine(this.lineStartPoint.x, this.lineStartPoint.y, x, y);
                this.lineStartPoint = null;
                this.savedImageData = null;
            }

            this.isDrawing = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDrawing = false;
            this.lineStartPoint = null;
        });
    }

    drawFreehand(x: number, y: number) {
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
        this.context.setLineDash([5, 5]); // Пунктир для предпросмотра
        this.context.beginPath();
        this.context.moveTo(x1, y1);
        this.context.lineTo(x2, y2);
        this.context.stroke();
        this.context.setLineDash([]); // Сбрасываем пунктир
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
        // Сохраняем текущее состояние canvas
        this.savedImageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    restoreDrawing() {
        // Восстанавливаем сохраненное состояние
        if (this.savedImageData) {
            this.context.putImageData(this.savedImageData, 0, 0);
        }
    }

    drawBackground(style: 'blank' | 'grid' | 'dots') {
        this.context.fillStyle = '#ffffff';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (style === 'grid') {
            this.drawGrid();
        } else if (style === 'dots') {
            this.drawDots();
        }
    }

    drawGrid() {
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

    drawDots() {
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

    clearCanvas() {
        this.drawBackground(this.pageStyle);
        this.savedImageData = null;
    }

    async exportToPDF() {
        try {
            // Динамический импорт jsPDF
            const jsPDF = await import('jspdf');
            const pdf = new jsPDF.default({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Конвертируем canvas в изображение
            const imgData = this.canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297); // A4 размер в мм

            // Сохраняем PDF
            const date = new Date().toISOString().split('T')[0];
            pdf.save(`drawing-${date}.pdf`);

            console.log('PDF успешно экспортирован');
        } catch (error) {
            console.error('Ошибка при экспорте в PDF:', error);
            alert('Ошибка при экспорте в PDF. Убедитесь, что jsPDF установлен.');
        }
    }

    async onClose() {
        // Очистка при закрытии
        this.isDrawing = false;
        this.lineStartPoint = null;
        this.savedImageData = null;
    }
}