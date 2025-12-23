/**
 * Statistics Module
 * Chart.js Integration
 */

let fullChart = null;

export function initStatsChart() {
    const fullCtx = document.getElementById('stats-chart-full');
    if (fullCtx) {
        fullChart = createChart(fullCtx, 7); // Default 7 days
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
                backgroundColor: '#3CB371', // 指定色
                borderColor: '#3CB371',
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
                    grid: { color: '#333' },
                    ticks: {
                        color: '#888',
                        display: true // Show dates
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

export function updateStatsChart(stats) {
    if (fullChart) {
        const initialStats = stats.slice(-7);
        updateChartData(fullChart, initialStats);
    }
}

function updateChartData(chart, data) {
    chart.data.labels = data.map(s => s.date.split('-').slice(1).join('/'));
    chart.data.datasets[0].data = data.map(s => s.count);
    chart.update();
}

export function aggregateStats(stats) {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStat = stats.find(s => s.date === todayStr);
    const todayCount = todayStat ? todayStat.count : 0;
    const weeklySum = stats.slice(-7).reduce((acc, s) => acc + s.count, 0);
    const monthlySum = stats.slice(-30).reduce((acc, s) => acc + s.count, 0);

    return { todayCount, weeklySum, monthlySum };
}

export function updateFullStatsPeriod(stats, period) {
    if (!fullChart) return;
    let filtered = stats;
    if (period === '1W') filtered = stats.slice(-7);
    else if (period === '1M') filtered = stats.slice(-30);
    else if (period === '1Y') filtered = stats.slice(-365);

    updateChartData(fullChart, filtered);
}

export function getTabLabel(period) {
    const labels = { '1W': '1週', '1M': '1月', '1Y': '1年' };
    return labels[period];
}
