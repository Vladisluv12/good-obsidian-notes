// drawing-view.ts - представление для рисования
import { ItemView, WorkspaceLeaf, Menu } from 'obsidian';

export const VIEW_TYPE_DRAWING = 'drawing-canvas-view';

export class DrawingView extends ItemView {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private currentColor: string = '#000000';
    private isDrawing: boolean = false;
    private isErasing: boolean = false;

    constructor(leaf: WorkspaceLeaf, private plugin: Plugin) {
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
        const toolbar = container.createDiv({ cls: 'drawing-toolbar' });

        // Кнопки инструментов
        toolbar.createEl('button', { text: 'Кисть', cls: 'tool-btn active' });
        toolbar.createEl('button', { text: 'Ластик', cls: 'tool-btn' });
        toolbar.createEl('button', { text: 'Линия', cls: 'tool-btn' });

        // Выбор цвета
        const colorPicker = toolbar.createEl('input', {
            type: 'color',
            value: '#000000'
        });

        // Выбор стиля страницы
        const pageStyle = toolbar.createEl('select');
        pageStyle.createEl('option', { value: 'blank', text: 'Чистая' });
        pageStyle.createEl('option', { value: 'grid', text: 'Клетка' });
        pageStyle.createEl('option', { value: 'dots', text: 'Точки' });

        // Кнопки действий
        toolbar.createEl('button', { text: 'Новая страница', cls: 'action-btn' });
        toolbar.createEl('button', { text: 'Экспорт в PDF', cls: 'action-btn' });

        // Холст для рисования
        this.canvas = container.createEl('canvas', {
            cls: 'drawing-canvas'
        }) as HTMLCanvasElement;

        this.canvas.width = 800;
        this.canvas.height = 1120; // A4 пропорции
        this.context = this.canvas.getContext('2d')!;

        // Рисуем фон
        this.drawBackground('grid');

        // Обработчики событий
        this.setupEventListeners();
    }

    drawBackground(style: string) {
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

    setupEventListeners() {
        let lastX = 0;
        let lastY = 0;
        let isStraightLineMode = false;
        let lineStartPoint = { x: 0, y: 0 };

        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            lastY = e.clientY - rect.top;

            if (isStraightLineMode) {
                lineStartPoint = { x: lastX, y: lastY };
            } else {
                this.isDrawing = true;
                this.context.beginPath();
                this.context.moveTo(lastX, lastY);
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawing && !isStraightLineMode) return;

            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (isStraightLineMode) {
                // Показываем предпросмотр линии
                this.redrawCanvas();
                this.context.strokeStyle = this.currentColor;
                this.context.lineWidth = 2;
                this.context.beginPath();
                this.context.moveTo(lineStartPoint.x, lineStartPoint.y);
                this.context.lineTo(x, y);
                this.context.stroke();
            } else if (this.isDrawing) {
                this.context.strokeStyle = this.isErasing ? '#ffffff' : this.currentColor;
                this.context.lineWidth = this.isErasing ? 10 : 2;
                this.context.lineCap = 'round';

                this.context.lineTo(x, y);
                this.context.stroke();
                this.context.beginPath();
                this.context.moveTo(x, y);
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDrawing = false;
        });
    }

    redrawCanvas() {
        // Сохраняем текущие рисунки и перерисовываем фон
        // Здесь нужна логика сохранения/восстановления рисунков
    }

    exportToPDF() {
        // Используем jsPDF для экспорта
        // Установите: npm install jspdf
        import('jspdf').then(jsPDF => {
            const pdf = new jsPDF.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Конвертируем canvas в изображение
            const imgData = this.canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297); // A4 размер в мм
            pdf.save('drawing.pdf');
        });
    }
}