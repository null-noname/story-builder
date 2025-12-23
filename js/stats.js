/**
 * Statistics Module
 * Chart.js Integration
 */

let miniChart = null;
let fullChart = null;

export function initStatsChart() {
    const miniCtx = document.getElementById('stats-chart-mini');
    if (miniCtx) {
        miniChart = createChart(miniCtx, 7); // Show last 7 days on mini
    }

    const fullCtx = document.getElementById('stats-chart-full');
    if (fullCtx) {
        fullChart = createChart(fullCtx, 30); // Default 30 days
    }
}

function createChart(ctx, count) {
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '執筆文字数',
                data: [],
                backgroundColor: '#00ff7f', // 明るい緑
                borderColor: '#00ff7f',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#333' },
                    ticks: { color: '#aaa', font: { weight: 'bold' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#aaa' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

export function updateStatsChart(stats) {
    if (miniChart) {
        const miniStats = stats.slice(-7);
        updateChartData(miniChart, miniStats);
    }
    if (fullChart) {
        updateChartData(fullChart, stats);
    }
}

function updateChartData(chart, data) {
    chart.data.labels = data.map(s => s.date.split('-').slice(1).join('/'));
    chart.data.datasets[0].data = data.map(s => s.count);
    chart.update();
}

export function updateFullStatsPeriod(stats, period) {
    if (!fullChart) return;
    let filtered = stats;
    if (period === '1W') filtered = stats.slice(-7);
    else if (period === '1M') filtered = stats.slice(-30);
    else if (period === '1Y') filtered = stats.slice(-365);

    updateChartData(fullChart, filtered);
}
