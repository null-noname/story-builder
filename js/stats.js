/**
 * Statistics Module
 * Chart.js Integration
 */

let chartInstance = null;

export function initStatsChart() {
    const ctx = document.getElementById('stats-chart');
    if (!ctx) return;

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '執筆文字数',
                data: [],
                backgroundColor: '#00ff7f', // 明るい縁
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
                    ticks: { color: '#aaa' }
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
    if (!chartInstance) return;

    const labels = stats.map(s => s.date.split('-').slice(1).join('/')); // MM/DD
    const data = stats.map(s => s.count);

    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.update();
}
