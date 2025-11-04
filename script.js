const DEFAULT_REMOTE_API_BASE = "https://hoodie-sales-worker.kanedius.workers.dev";
const DEFAULT_LOCAL_API_BASE = "http://localhost:3000";

function normalizeApiBase(value) {
    return value ? String(value).trim().replace(/\/+$/, '') : '';
}

function resolveInitialApiBase() {
    if (window.__HOODIE_API_BASE__) {
        return normalizeApiBase(window.__HOODIE_API_BASE__);
    }
    if (location.origin.includes('workers.dev')) {
        return normalizeApiBase(location.origin);
    }
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (localHosts.has(location.hostname)) {
        if (location.port === '3000') {
            return normalizeApiBase(location.origin);
        }
        return normalizeApiBase(DEFAULT_REMOTE_API_BASE);
    }
    return normalizeApiBase(DEFAULT_REMOTE_API_BASE);
}

function buildApiCandidates() {
    const candidates = [];
    const initial = resolveInitialApiBase();
    if (initial) {
        candidates.push(initial);
    }
    const remote = normalizeApiBase(DEFAULT_REMOTE_API_BASE);
    if (remote && !candidates.includes(remote)) {
        candidates.push(remote);
    }
    const local = normalizeApiBase(DEFAULT_LOCAL_API_BASE);
    if (local && !candidates.includes(local)) {
        candidates.push(local);
    }
    return candidates;
}

let API_BASE_URL = resolveInitialApiBase();
let salesData = { products: [] };
let normalizedProducts = [];
let salesDataLoaded = false;
let chartDataLabelsRegistered = false;
let dashboardInitialized = false;

async function loadSalesData(options = {}) {
    const { force = false } = options;
    if (salesDataLoaded && !force) {
        return salesData;
    }
    const candidates = buildApiCandidates();
    let lastError = null;
    for (const base of candidates) {
        try {
            const endpoint = `${base}/api/sales`;
            const response = await fetch(endpoint, {
                headers: {
                    'Accept': 'application/json'
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to load sales data: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            if (!data || !Array.isArray(data.products)) {
                throw new Error('Unexpected API response shape');
            }
            API_BASE_URL = base;
            window.__HOODIE_API_BASE__ = base;
            salesData = data;
            normalizedProducts = deduplicateProducts(data.products);
            buildInventoryIndex(data.products);
            salesDataLoaded = true;
            return salesData;
        } catch (error) {
            console.warn(`Sales API fetch failed for ${base}`, error);
            lastError = error;
        }
    }
    throw lastError ?? new Error('Unable to load sales data from available API endpoints');
}


let salesChart, weeklyDemandChart;
let inventoryByProduct = new Map();
const INVENTORY_KEY_DELIMITER = '||';
const inventoryDateFormatter = new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short'
});
// Define preferred size order for consistent display
const sizeOrder = ['XS', 'XS/S', 'S', 'M', 'M/L', 'L', 'XL', 'XL/XXL', '2XL', 'XXL', '3XL'];
// Function to assign colors
function getColor(name) {
    const colorMap = {
        'Чорний': '#000000',
        'Білий': '#E0E0E0',
        'Ніжно-рожевий': '#FFC1CC',
        'Бежевий': '#F5F5DC',
        'Олива': '#808000',
        'Сірий Грі': '#808080',
        'Сірий': '#808080',
        'Хакі': '#C3B091',
        'Койот': '#8B6F47',
        'Інший Колір': '#FF00FF',
        'XS': '#FF6347',
        'S': '#4682B4',
        'M': '#32CD32',
        'L': '#FFD700',
        'XL': '#6A5ACD',
        'XXL': '#FF4500',
        '3XL': '#9ACD32',
        'M/L': '#20B2AA',
        'XL/XXL': '#DA70D6',
        'XS/S': '#FF8C00'
    };
    return colorMap[name] || '#000000';
}

// Function to extract and sort sizes for a product
function getProductSizes(productData) {
    const sizeSet = new Set();
    productData.months.forEach(month => {
        Object.values(month.colors).forEach(colorData => {
            colorData.forEach(item => sizeSet.add(item.size));
        });
    });
    const sizes = Array.from(sizeSet);
    return sizes.sort((a, b) => {
        const indexA = sizeOrder.indexOf(a);
        const indexB = sizeOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) {
            return a.localeCompare(b, 'uk');
        }
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
}
// Function to calculate total sales for a dataset
function calculateTotalSales(data) {
    return data.reduce((sum, value) => sum + value, 0);
}

function formatNumber(value, decimals = 0) {
    const factor = Math.pow(10, decimals);
    let rounded = Math.round(value * factor) / factor;
    if (Object.is(rounded, -0)) {
        rounded = 0;
    }
    if (decimals > 0) {
        return rounded
            .toFixed(decimals)
            .replace(/\.0+$/, '')
            .replace(/(\.\d*[1-9])0+$/, '$1');
    }
    return rounded.toString();
}

function formatDelta(delta, decimals = 0) {
    if (delta === null || typeof delta === 'undefined') {
        return '';
    }
    const factor = Math.pow(10, decimals);
    let roundedDelta = Math.round(delta * factor) / factor;
    if (Object.is(roundedDelta, -0)) {
        roundedDelta = 0;
    }
    const sign = roundedDelta > 0 ? '+' : '';
    const className = roundedDelta > 0 ? 'positive' : roundedDelta < 0 ? 'negative' : 'neutral';
    const formatted = decimals > 0
        ? formatNumber(roundedDelta, decimals)
        : formatNumber(roundedDelta, 0);
    return `<span class="diff ${className}">(${sign}${formatted})</span>`;
}

function getInventoryKey(color, size) {
    const safeColor = typeof color === 'string' ? color : '';
    const safeSize = typeof size === 'string' ? size : '';
    return `${safeColor}${INVENTORY_KEY_DELIMITER}${safeSize}`;
}

function buildInventoryIndex(products) {
    inventoryByProduct = new Map();
    if (!Array.isArray(products)) {
        return;
    }
    products.forEach(product => {
        if (!product || !product.name) {
            return;
        }
        const variantMap = new Map();
        (product.variants || []).forEach(variant => {
            const key = getInventoryKey(variant.color, variant.size);
            if (key) {
                variantMap.set(key, {
                    sku: variant.sku || '',
                    color: variant.color,
                    size: variant.size
                });
            }
        });
        const rowMap = new Map();
        const inventory = product.inventory && typeof product.inventory === 'object'
            ? product.inventory
            : {};
        Object.entries(inventory).forEach(([color, sizes]) => {
            Object.entries(sizes || {}).forEach(([size, info]) => {
                const key = getInventoryKey(color, size);
                if (!key) {
                    return;
                }
                const variant = variantMap.get(key);
                const inStock = info && typeof info.in_stock === 'number' ? info.in_stock : null;
                const inReserve = info && typeof info.in_reserve === 'number' ? info.in_reserve : null;
                const updatedAt = info && typeof info.updated_at === 'string' ? info.updated_at : null;
                rowMap.set(key, {
                    sku: variant ? variant.sku || '' : '',
                    color,
                    size,
                    in_stock: inStock,
                    in_reserve: inReserve,
                    updated_at: updatedAt
                });
            });
        });
        (product.variants || []).forEach(variant => {
            const key = getInventoryKey(variant.color, variant.size);
            if (!key) {
                return;
            }
            if (!rowMap.has(key)) {
                rowMap.set(key, {
                    sku: variant.sku || '',
                    color: variant.color,
                    size: variant.size,
                    in_stock: null,
                    in_reserve: null,
                    updated_at: null
                });
            } else if (variant.sku && !rowMap.get(key).sku) {
                const record = rowMap.get(key);
                record.sku = variant.sku;
            }
        });
        const rows = Array.from(rowMap.values()).filter(row => {
            if (!row.sku) {
                return false;
            }
            return row.sku.toUpperCase().startsWith('KUF');
        });
        rows.sort((a, b) => {
            if (a.color !== b.color) {
                return a.color.localeCompare(b.color, 'uk');
            }
            const indexA = sizeOrder.indexOf(a.size);
            const indexB = sizeOrder.indexOf(b.size);
            if (indexA === -1 && indexB === -1) {
                return a.size.localeCompare(b.size, 'uk');
            }
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        inventoryByProduct.set(product.name, rows);
    });
}

function formatInventoryTimestamp(value) {
    if (!value) {
        return '—';
    }
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return inventoryDateFormatter.format(date);
    } catch (error) {
        return value;
    }
}

function applyInventoryValue(cell, value) {
    cell.classList.add('numeric');
    if (typeof value === 'number') {
        cell.textContent = formatNumber(value, 0);
        if (value < 0) {
            cell.classList.add('negative');
        } else if (value < 20) {
            cell.classList.add('critical');
        } else if (value < 100) {
            cell.classList.add('warning');
        } else {
            cell.classList.add('positive');
        }
    } else {
        cell.textContent = '—';
        cell.classList.add('dimmed');
    }
}

function renderInventoryForProduct(productName, filterColor = null) {
    const container = document.getElementById('inventoryTableContainer');
    if (!container) {
        return;
    }
    if (!salesDataLoaded || !inventoryByProduct || inventoryByProduct.size === 0) {
        container.innerHTML = '<p class="inventory-empty">Дані про залишки зараз недоступні.</p>';
        return;
    }
    if (!productName) {
        container.innerHTML = '<p class="inventory-empty">Оберіть товар, щоб побачити залишки.</p>';
        return;
    }
    const allRows = inventoryByProduct.get(productName) || [];
    let rows = allRows;
    if (filterColor) {
        rows = rows.filter(row => row.color === filterColor);
    }
    if (!rows.length) {
        if (filterColor) {
            container.innerHTML = `<p class="inventory-empty">Немає даних про залишки для кольору ${filterColor}.</p>`;
        } else {
            container.innerHTML = '<p class="inventory-empty">Немає даних про залишки для обраного товару.</p>';
        }
        return;
    }
    const totalStock = rows.reduce((sum, row) => sum + (typeof row.in_stock === 'number' ? row.in_stock : 0), 0);
    const totalReserve = rows.reduce((sum, row) => sum + (typeof row.in_reserve === 'number' ? row.in_reserve : 0), 0);
    const fragment = document.createDocumentFragment();
    const summary = document.createElement('p');
    summary.className = 'inventory-summary';
    const scopeLabel = filterColor ? ` (колір: ${filterColor})` : '';
    summary.innerHTML = `На складі${scopeLabel}: <strong>${formatNumber(totalStock, 0)}</strong> шт. • У резерві: <strong>${formatNumber(totalReserve, 0)}</strong> шт.`;
    fragment.appendChild(summary);
    const table = document.createElement('table');
    table.className = 'inventory-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>SKU</th>
            <th>Колір</th>
            <th>Розмір</th>
            <th>На складі</th>
            <th>У резерві</th>
            <th>Оновлено</th>
        </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        const skuCell = document.createElement('td');
        skuCell.textContent = row.sku || '—';
        if (!row.sku) {
            skuCell.classList.add('dimmed');
        }
        tr.appendChild(skuCell);
        const colorCell = document.createElement('td');
        colorCell.textContent = row.color || '—';
        tr.appendChild(colorCell);
        const sizeCell = document.createElement('td');
        sizeCell.textContent = row.size || '—';
        tr.appendChild(sizeCell);
        const stockCell = document.createElement('td');
        applyInventoryValue(stockCell, row.in_stock);
        tr.appendChild(stockCell);
        const reserveCell = document.createElement('td');
        applyInventoryValue(reserveCell, row.in_reserve);
        tr.appendChild(reserveCell);
        const dateCell = document.createElement('td');
        dateCell.textContent = formatInventoryTimestamp(row.updated_at);
        if (!row.updated_at) {
            dateCell.classList.add('dimmed');
        }
        tr.appendChild(dateCell);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    fragment.appendChild(table);
    container.replaceChildren(fragment);
}

// Helper to get month index (0-based)
const MONTH_INDEXES = new Map([
    ['січень', 0],
    ['лютий', 1],
    ['березень', 2],
    ['квітень', 3],
    ['травень', 4],
    ['червень', 5],
    ['липень', 6],
    ['серпень', 7],
    ['вересень', 8],
    ['жовтень', 9],
    ['листопад', 10],
    ['грудень', 11],
    // legacy CP1251-encoded варіанти для старих даних
    ['�?祭�'.toLowerCase(), 0],
    ['��⨩'.toLowerCase(), 1],
    ['��१���'.toLowerCase(), 2],
    ['��?⥭�'.toLowerCase(), 3],
    ['�ࠢ���'.toLowerCase(), 4],
    ['�ࢥ��'.toLowerCase(), 5],
    ['������'.toLowerCase(), 6],
    ['�௥��'.toLowerCase(), 7],
    ['���ᥭ�'.toLowerCase(), 8],
    ['���⥭�'.toLowerCase(), 9],
    ['���⮯��'.toLowerCase(), 10],
    ['��㤥��'.toLowerCase(), 11],
]);

function getMonthIndex(monthName) {
    if (!monthName) {
        return 0;
    }
    const normalized = monthName.toString().trim().toLowerCase();
    return MONTH_INDEXES.get(normalized) ?? 0;
}
// Function to get days in a month
function getDaysInMonth(month, year) {
    return new Date(year, getMonthIndex(month) + 1, 0).getDate();
}

function deduplicateProducts(products) {
    const productMap = new Map();
    products.forEach(product => {
        if (!productMap.has(product.name)) {
            productMap.set(product.name, {
                name: product.name,
                months: []
            });
        }
        const mergedProduct = productMap.get(product.name);
        product.months.forEach(month => {
            const existingMonth = mergedProduct.months.find(
                m => m.year === month.year && m.month === month.month
            );
            if (!existingMonth) {
                mergedProduct.months.push({
                    month: month.month,
                    year: month.year,
                    colors: Object.fromEntries(
                        Object.entries(month.colors).map(([color, sizes]) => [
                            color,
                            sizes.map(item => ({ ...item }))
                        ])
                    )
                });
            } else {
                Object.entries(month.colors).forEach(([color, sizes]) => {
                    if (!existingMonth.colors[color]) {
                        existingMonth.colors[color] = sizes.map(item => ({ ...item }));
                    } else {
                        const sizeMap = new Map(
                            existingMonth.colors[color].map(item => [item.size, item.quantity])
                        );
                        sizes.forEach(item => {
                            sizeMap.set(item.size, (sizeMap.get(item.size) || 0) + item.quantity);
                        });
                        existingMonth.colors[color] = Array.from(sizeMap, ([size, quantity]) => ({
                            size,
                            quantity
                        }));
                    }
                });
            }
        });
        mergedProduct.months.sort((a, b) => {
            if (a.year !== b.year) {
                return a.year - b.year;
            }
            return getMonthIndex(a.month) - getMonthIndex(b.month);
        });
    });
    return Array.from(productMap.values());
}

function getProductByName(name) {
    return normalizedProducts.find(product => product.name === name) || null;
}

function getSelectedYear() {
    const yearElement = document.getElementById('yearSelect');
    if (!yearElement) {
        return null;
    }
    const yearValue = parseInt(yearElement.value, 10);
    return Number.isNaN(yearValue) ? null : yearValue;
}
// Function to update total sales display
function updateTotalSales(productData, filteredMonths, chartType, datasets) {
    const totalSalesDiv = document.getElementById('totalSales');
    let html = '<h3>Підсумок за вибраними параметрами:</h3><ul>';
    const selectedYear = filteredMonths.length > 0 ? filteredMonths[0].year : null;
    const previousYear = selectedYear !== null ? selectedYear - 1 : null;
    const monthNames = filteredMonths.map(month => month.month);
    const previousYearMonths = previousYear !== null
        ? productData.months.filter(month => month.year === previousYear && monthNames.includes(month.month))
        : [];
    const hasPreviousData = previousYearMonths.length > 0;
    datasets.forEach(dataset => {
        const total = calculateTotalSales(dataset.data);
        const label = dataset.label;
        const color = getColor(label);
        let previousTotal = 0;
        if (hasPreviousData) {
            if (chartType === 'byColor') {
                previousTotal = previousYearMonths.reduce((sum, month) => {
                    const colorData = month.colors[label];
                    if (!colorData) {
                        return sum;
                    }
                    return sum + colorData.reduce((acc, item) => acc + item.quantity, 0);
                }, 0);
            } else {
                previousTotal = previousYearMonths.reduce((sum, month) => {
                    const colorData = month.colors[chartType];
                    if (!colorData) {
                        return sum;
                    }
                    const item = colorData.find(i => i.size === label);
                    return sum + (item ? item.quantity : 0);
                }, 0);
            }
        }
        const diffHtml = hasPreviousData ? formatDelta(total - previousTotal) : '';
        html += `<li><span class="label"><span class="color-square" style="background-color: ${color};"></span>${label}</span><span class="value">${total}${diffHtml ? ` ${diffHtml}` : ''}</span></li>`;
    });
    html += '</ul>';
    totalSalesDiv.innerHTML = html;
}
// Function to update daily demand text display
function updateDailyDemandNumbers(productData) {
    const dailyDemandList = document.getElementById('dailyDemandList');
    const yearSelect = document.getElementById('yearSelect').value;
    const monthSelect = document.getElementById('monthSelect').value;
    const colorSelect = document.getElementById('colorSelect').value;
    let html = '';
    const month = productData.months.find(m => m.year === parseInt(yearSelect) && m.month === monthSelect);
    if (!month || !month.colors[colorSelect]) {
        html = '<p>Дані для цієї комбінації параметрів відсутні. Спробуйте змінити фільтри.</p>';
        dailyDemandList.innerHTML = html;
        return;
    }
    const colorHex = getColor(colorSelect);
    const productSizes = getProductSizes(productData);
    const daysInMonth = getDaysInMonth(month.month, month.year);
    const previousYear = month.year - 1;
    const previousMonth = productData.months.find(m => m.year === previousYear && m.month === month.month) || null;
    const previousDaysInMonth = previousMonth ? getDaysInMonth(previousMonth.month, previousMonth.year) : null;
    let totalDaily = 0; // Підсумовуємо середньоденний попит для підсумкового рядка
    let totalPreviousDaily = 0;
    html += `<h4><span class="color-square" style="background-color: ${colorHex};"></span>${colorSelect}</h4>`;
    html += '<ul class="fade-in">';
    productSizes.forEach(size => {
        const colorData = month.colors[colorSelect];
        const item = colorData ? colorData.find(i => i.size === size) : null;
        const total = item ? item.quantity : 0;
        const daily = Math.round((total / daysInMonth) * 10) / 10;
        let previousDaily = null;
        if (previousMonth && previousDaysInMonth) {
            const previousColorData = previousMonth.colors[colorSelect] || [];
            const previousItem = previousColorData.find(i => i.size === size) || null;
            const previousTotal = previousItem ? previousItem.quantity : 0;
            previousDaily = Math.round((previousTotal / previousDaysInMonth) * 10) / 10;
        }
        if (previousDaily !== null) {
            totalPreviousDaily += previousDaily;
        }
        if (daily > 0) {
            const diffHtml = previousDaily !== null ? formatDelta(daily - previousDaily, 1) : '';
            html += `<li class="fade-in"><span class="label">${size}</span><span class="value">${daily}${diffHtml ? ` ${diffHtml}` : ''}</span></li>`;
        }
        totalDaily += daily;
    });
    totalDaily = Math.round(totalDaily * 10) / 10; // Округлюємо загальний попит до однієї десяткової
    totalPreviousDaily = Math.round(totalPreviousDaily * 10) / 10;
    const totalDiffHtml = previousMonth && previousDaysInMonth ? formatDelta(totalDaily - totalPreviousDaily, 1) : '';
    html += `<li class="fade-in"><span class="label">Загальний середньоденний попит</span><span class="value">${totalDaily}${totalDiffHtml ? ` ${totalDiffHtml}` : ''}</span></li>`;
    html += '</ul>';
    dailyDemandList.innerHTML = html;
    // Remove fade-in class after animation completes
    setTimeout(() => {
        const ul = dailyDemandList.querySelector('ul');
        if (ul) ul.classList.remove('fade-in');
        const lis = dailyDemandList.querySelectorAll('li');
        lis.forEach(li => li.classList.remove('fade-in'));
    }, 500); // Matches animation duration
}
// Function to calculate weekly demand data
function calculateWeeklyDemandData(productData, months, chartType) {
    const datasets = [];
    const productSizes = getProductSizes(productData);
    if (chartType === 'byColor') {
        const colors = getProductColors(productData, months);
        colors.forEach(color => {
            const data = months.map(month => {
                const daysInMonth = getDaysInMonth(month.month, month.year);
                const weeksInMonth = daysInMonth / 7;
                const total = month.colors[color] ? month.colors[color].reduce((sum, item) => sum + item.quantity, 0) : 0;
                return Math.round((total / weeksInMonth) * 10) / 10;
            });
            datasets.push({
                label: color,
                data: data,
                backgroundColor: getColor(color),
                borderColor: getColor(color),
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 0.9
            });
        });
    } else {
        const color = chartType;
        productSizes.forEach(size => {
            const data = months.map(month => {
                const daysInMonth = getDaysInMonth(month.month, month.year);
                const weeksInMonth = daysInMonth / 7;
                const colorData = month.colors[color];
                const item = colorData ? colorData.find(i => i.size === size) : null;
                const total = item ? item.quantity : 0;
                return Math.round((total / weeksInMonth) * 10) / 10;
            });
            datasets.push({
                label: size,
                data: data,
                backgroundColor: getColor(size),
                borderColor: getColor(size),
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 0.9
            });
        });
    }
    return datasets;
}
// Function to get colors for a product
function getProductColors(productData, monthsSubset = null) {
    const colorSet = new Set();
    const sourceMonths = monthsSubset || productData.months;
    sourceMonths.forEach(month => {
        Object.keys(month.colors).forEach(color => colorSet.add(color));
    });
    return Array.from(colorSet);
}
// Function to update year dropdown
function updateYearSelect(productData) {
    const yearSelect = document.getElementById('yearSelect');
    const previousValue = yearSelect.value;
    yearSelect.innerHTML = '';
    const years = Array.from(new Set(productData.months.map(month => month.year))).sort((a, b) => a - b);
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
    if (years.length === 0) {
        yearSelect.innerHTML = '<option value="">Немає доступних років</option>';
        return;
    }
    const fallbackYear = String(years[years.length - 1]);
    const selectedYear = years.map(String).includes(previousValue) ? previousValue : fallbackYear;
    yearSelect.value = selectedYear;
}
// Function to update month dropdown
function updateMonthSelect(productData) {
    const monthSelect = document.getElementById('monthSelect');
    const previousValue = monthSelect.value;
    const yearSelectValue = parseInt(document.getElementById('yearSelect').value, 10);
    monthSelect.innerHTML = '';
    if (Number.isNaN(yearSelectValue)) {
        monthSelect.innerHTML = '<option value="">Немає доступних місяців</option>';
        return;
    }
    const months = Array.from(new Set(
        productData.months
            .filter(month => month.year === yearSelectValue)
            .map(month => month.month)
    )).sort((a, b) => getMonthIndex(a) - getMonthIndex(b));
    console.log('[debug] candidate months (sorted):', months);
    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = month;
        monthSelect.appendChild(option);
    });
    if (months.length === 0) {
        monthSelect.innerHTML = '<option value="">Немає доступних місяців</option>';
        return;
    }
    const fallbackMonth = months[0];
    const selectedMonth = months.includes(previousValue) ? previousValue : fallbackMonth;
    monthSelect.value = selectedMonth;
}
// Function to update color dropdown
function updateColorSelect(productData) {
    const colorSelect = document.getElementById('colorSelect');
    const previousValue = colorSelect.value;
    const yearSelectValue = parseInt(document.getElementById('yearSelect').value, 10);
    const monthSelectValue = document.getElementById('monthSelect').value;
    colorSelect.innerHTML = '';
    if (Number.isNaN(yearSelectValue) || !monthSelectValue) {
        colorSelect.innerHTML = '<option value="">Немає доступних кольорів</option>';
        return;
    }
    const colors = Array.from(new Set(
        productData.months
            .filter(month => month.year === yearSelectValue && month.month === monthSelectValue)
            .flatMap(month => Object.keys(month.colors))
    )).sort((a, b) => a.localeCompare(b, 'uk'));
    colors.forEach(color => {
        const option = document.createElement('option');
        option.value = color;
        option.textContent = color;
        colorSelect.appendChild(option);
    });
    if (colors.length === 0) {
        colorSelect.innerHTML = '<option value="">Немає доступних кольорів</option>';
        return;
    }
    const fallbackColor = colors[0];
    const selectedColor = colors.includes(previousValue) ? previousValue : fallbackColor;
    colorSelect.value = selectedColor;
}
// Function to update product dropdown
function updateProductSelect() {
    const productSelect = document.getElementById('productSelect');
    const previousValue = productSelect.value;
    productSelect.innerHTML = '';
    if (!normalizedProducts || normalizedProducts.length === 0) {
        productSelect.innerHTML = '<option value="">Немає доступних товарів</option>';
        document.getElementById('totalSales').innerHTML = '<p style="color: red;">Попередження: для вибраних параметрів немає статистики</p>';
        renderInventoryForProduct('');
        console.error('normalizedProducts is empty or undefined');
        return;
    }
    normalizedProducts.forEach(product => {
        const option = document.createElement('option');
        option.value = product.name;
        option.textContent = product.name;
        productSelect.appendChild(option);
    });
    const fallbackValue = normalizedProducts[0]?.name || '';
    const hasPreviousValue = normalizedProducts.some(product => product.name === previousValue);
    const nextValue = hasPreviousValue ? previousValue : fallbackValue;
    if (nextValue) {
        productSelect.value = nextValue;
    }
    console.log('Product select updated with', normalizedProducts.length, 'products');
}
// Function to update chart type dropdown
function updateChartTypes() {
    const productSelect = document.getElementById('productSelect').value;
    const chartTypeSelect = document.getElementById('chartType');
    chartTypeSelect.innerHTML = '<option value="byColor">Розподіл продажів за кольорами</option>';
    const productData = getProductByName(productSelect);
    if (!productData) {
        console.error('No product data for', productSelect);
        return;
    }
    const colors = getProductColors(productData);
    colors.forEach(color => {
        const option = document.createElement('option');
        option.value = color;
        option.textContent = `Колір: ${color}`;
        chartTypeSelect.appendChild(option);
    });
    console.log('Chart types updated with', colors.length, 'colors');
}
// Function to update charts based on selection
function updateChart() {
    const productSelect = document.getElementById('productSelect').value;
    const chartType = document.getElementById('chartType').value;
    const filterColor = chartType !== 'byColor' ? chartType : null;
    const salesChartTitle = document.getElementById('salesChartTitle');
    const weeklyDemandChartTitle = document.getElementById('weeklyDemandChartTitle');
    const productData = getProductByName(productSelect);
    if (!productData) {
        salesChartTitle.textContent = 'Дані про продукт недоступні';
        weeklyDemandChartTitle.textContent = 'Дані про тижневий попит недоступні';
        document.getElementById('totalSales').innerHTML = '<p style="color: red;">Попередження: відсутня статистика для вибраного товару</p>';
        document.getElementById('dailyDemandList').innerHTML = '';
        console.error('Product not found:', productSelect);
        renderInventoryForProduct('', filterColor);
        return;
    }
    renderInventoryForProduct(productData.name, filterColor);
    const selectedYear = getSelectedYear();
    const filteredMonths = selectedYear === null
        ? productData.months
        : productData.months.filter(month => month.year === selectedYear);
    if (filteredMonths.length === 0) {
        salesChartTitle.textContent = `Немає даних для ${productSelect} у ${selectedYear} році`;
        weeklyDemandChartTitle.textContent = `Немає даних про тижневий попит для ${productSelect} у ${selectedYear} році`;
        if (salesChart) {
            salesChart.destroy();
            salesChart = null;
        }
        if (weeklyDemandChart) {
            weeklyDemandChart.destroy();
            weeklyDemandChart = null;
        }
        document.getElementById('totalSales').innerHTML = '<p>Дані для обраних параметрів відсутні</p>';
        return;
    }
    const colors = getProductColors(productData, filteredMonths);
    const months = filteredMonths.map(m => `${m.month} ${m.year}`);
    const productSizes = getProductSizes(productData);
    let salesDatasets = [];
    if (chartType === 'byColor') {
        salesDatasets = colors.map(color => {
            const data = filteredMonths.map(month => {
                return month.colors[color] ? month.colors[color].reduce((sum, item) => sum + item.quantity, 0) : 0;
            });
            return {
                label: color,
                data: data,
                backgroundColor: getColor(color),
                borderColor: getColor(color),
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 0.9
            };
        });
        const titleSuffix = selectedYear ? ` (${selectedYear} рік)` : '';
        salesChartTitle.textContent = `Продажі за кольорами для ${productSelect}${titleSuffix}`;
        weeklyDemandChartTitle.textContent = `Щотижневий попит за кольорами для ${productSelect}${titleSuffix}`;
    } else {
        salesDatasets = productSizes.map(size => {
            const data = filteredMonths.map(month => {
                const colorData = month.colors[chartType];
                const item = colorData ? colorData.find(i => i.size === size) : null;
                return item ? item.quantity : 0;
            });
            return {
                label: size,
                data: data,
                backgroundColor: getColor(size),
                borderColor: getColor(size),
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 0.9
            };
        });
        const titleSuffix = selectedYear ? ` (${selectedYear} рік)` : '';
        salesChartTitle.textContent = `Продажі за розмірами для кольору ${chartType} (${productSelect})${titleSuffix}`;
        weeklyDemandChartTitle.textContent = `Щотижневий попит за розмірами (${chartType}) для ${productSelect}${titleSuffix}`;
    }
    // Update total sales
    updateTotalSales(productData, filteredMonths, chartType, salesDatasets);
    // Update sales chart
    if (salesChart) {
        salesChart.destroy();
    }
    salesChart = new Chart(document.getElementById('salesChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: months,
            datasets: salesDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Кількість продажів'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Місяці'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                datalabels: {
                    display: true,
                    align: 'end',
                    anchor: 'end',
                    formatter: (value) => value > 0 ? value : ''
                }
            }
        }
    });
    // Update weekly demand chart
    const weeklyDemandDatasets = calculateWeeklyDemandData(productData, filteredMonths, chartType);
    if (weeklyDemandChart) {
        weeklyDemandChart.destroy();
    }
    weeklyDemandChart = new Chart(document.getElementById('weeklyDemandChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: months,
            datasets: weeklyDemandDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Щотижневий попит, од.'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Місяці'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                datalabels: {
                    display: true,
                    align: 'end',
                    anchor: 'end',
                    formatter: (value) => value > 0 ? value : ''
                }
            }
        }
    });
    console.log('Charts updated for', productSelect, 'with type', chartType);
}

function updateSelectorsForCurrentProduct() {
    const productSelectElement = document.getElementById('productSelect');
    if (!productSelectElement) {
        console.error('Product select element not found');
        renderInventoryForProduct('');
        return;
    }
    const selectedProductName = productSelectElement.value;
    const productData = getProductByName(selectedProductName);
    if (!productData) {
        const chartTypeElement = document.getElementById('chartType');
        const filterColor = chartTypeElement && chartTypeElement.value !== 'byColor'
            ? chartTypeElement.value
            : null;
        renderInventoryForProduct('', filterColor);
        console.error('Product not found for current selection');
        return;
    }
    updateYearSelect(productData);
    updateMonthSelect(productData);
    updateColorSelect(productData);
    updateDailyDemandNumbers(productData);
    updateChart();
}

function rebuildDashboardState() {
    const productSelectElement = document.getElementById('productSelect');
    updateProductSelect();
    if (!normalizedProducts || normalizedProducts.length === 0) {
        return;
    }
    if (productSelectElement && !productSelectElement.value) {
        const firstOption = productSelectElement.options[0];
        if (firstOption) {
            productSelectElement.value = firstOption.value;
        }
    }
    updateChartTypes();
    updateSelectorsForCurrentProduct();
}
// Function to initialize
function init() {
    console.log('Init started. salesData:', salesData ? 'defined' : 'undefined');
    if (!chartDataLabelsRegistered) {
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
            chartDataLabelsRegistered = true;
            console.log('ChartDataLabels registered');
        } else {
            console.warn('ChartDataLabels not loaded');
        }
    }
    rebuildDashboardState();
    if (!dashboardInitialized) {
        document.getElementById('productSelect').addEventListener('change', () => {
            updateChartTypes();
            updateSelectorsForCurrentProduct();
        });
        document.getElementById('chartType').addEventListener('change', () => {
            updateChart();
        });
        document.getElementById('yearSelect').addEventListener('change', () => {
            const productData = getProductByName(document.getElementById('productSelect').value);
            if (!productData) {
                console.error('Product not found when year changed');
                return;
            }
            updateMonthSelect(productData);
            updateColorSelect(productData);
            updateDailyDemandNumbers(productData);
            updateChart();
        });
        document.getElementById('monthSelect').addEventListener('change', () => {
            const productData = getProductByName(document.getElementById('productSelect').value);
            if (!productData) {
                console.error('Product not found when month changed');
                return;
            }
            updateColorSelect(productData);
            updateDailyDemandNumbers(productData);
        });
        document.getElementById('colorSelect').addEventListener('change', () => {
            const productData = getProductByName(document.getElementById('productSelect').value);
            if (!productData) {
                console.error('Product not found when color changed');
                return;
            }
            updateDailyDemandNumbers(productData);
            updateChart();
        });
        dashboardInitialized = true;
    }
}

async function refreshDashboard() {
    const refreshButton = document.getElementById('refreshButton');
    const statusEl = document.getElementById('totalSales');
    const originalLabel = refreshButton ? refreshButton.textContent : '';
    try {
        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = 'Оновлення…';
        }
        if (statusEl) {
            statusEl.innerHTML = '<p>Оновлення даних…</p>';
        }
        await loadSalesData({ force: true });
        rebuildDashboardState();
    } catch (error) {
        console.error('Failed to refresh dashboard', error);
        if (statusEl) {
            statusEl.innerHTML = '<p style="color: red;">Не вдалося оновити дані</p>';
        }
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = originalLabel || 'Оновити дані';
        }
    }
}
// Run after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[debug] DOMContentLoaded start');
    const statusEl = document.getElementById('totalSales');
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshDashboard();
        });
    }
    try {
        if (statusEl) {
            statusEl.innerHTML = '<p>Завантаження даних…</p>';
        }
        console.log(`[debug] fetching sales data from ${API_BASE_URL}/api/sales`);
        await loadSalesData();
        console.log('[debug] sales data loaded. products:', normalizedProducts.map(p => p.name));
        if (!normalizedProducts.length) {
            if (statusEl) {
                statusEl.innerHTML = '<p>Дані відсутні</p>';
            }
            return;
        }
        init();
    } catch (error) {
        console.error('Failed to load sales data', error);
        if (statusEl) {
            statusEl.innerHTML = '<p style="color: red;">Помилка завантаження даних</p>';
        }
    }
});

window.refreshDashboard = refreshDashboard;

window.addEventListener('resize', () => {
    if (salesChart) salesChart.resize();
    if (weeklyDemandChart) weeklyDemandChart.resize();
});





