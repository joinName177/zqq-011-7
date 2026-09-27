import { SynopticChartData, MoodRecord, StorageRecoveryReport } from '../core/models';
import { TAG_METAS } from '../core/meteorology-engine';

export interface WeatherUIHandlers {
  onOpenLogModal: () => void;
  onResetData: () => void;
  onSubmitLog: (tag: string, intensity: number, note: string) => void;
  onSelectRecord: (record: MoodRecord) => void;
}

export function renderWeatherApp(
  container: HTMLElement,
  chartData: SynopticChartData,
  isModalOpen: boolean,
  selectedTag: string,
  selectedIntensity: number,
  noteText: string,
  recoveryReport: StorageRecoveryReport | null,
  handlers: WeatherUIHandlers,
  onCloseModal: () => void,
  onTagChange: (tag: string) => void,
  onIntensityChange: (val: number) => void,
  onNoteChange: (val: string) => void,
  onDismissRecovery: () => void
) {
  const cur = chartData.currentRecord;
  const meta = TAG_METAS[cur.tag] || TAG_METAS['阴转多云'];

  const esc = (s: string) =>
    s.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));

  // Generate Isobar SVG paths dynamically based on records
  const isobarsSvg = `
    <svg class="synoptic-svg" viewBox="0 0 800 380" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(0, 240, 255, 0.15)" />
          <stop offset="50%" stop-color="rgba(58, 134, 255, 0.05)" />
          <stop offset="100%" stop-color="rgba(255, 0, 84, 0.1)" />
        </linearGradient>
        <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
        </pattern>
      </defs>

      <!-- Background Grid -->
      <rect width="100%" height="100%" fill="url(#gridPattern)" />
      <rect width="100%" height="100%" fill="url(#cloudGrad)" />

      <!-- Lat/Long Guides -->
      <line x1="0" y1="190" x2="800" y2="190" stroke="rgba(0, 240, 255, 0.2)" stroke-dasharray="4,4" />
      <line x1="400" y1="0" x2="400" y2="380" stroke="rgba(0, 240, 255, 0.2)" stroke-dasharray="4,4" />
      <text x="410" y="25" fill="rgba(0, 240, 255, 0.4)" font-size="10" font-family="monospace">CENTRAL MERIDIAN 120°E</text>
      <text x="15" y="180" fill="rgba(0, 240, 255, 0.4)" font-size="10" font-family="monospace">PSYCHIC EQUATOR 0°</text>

      <!-- Isobar Concentric Waves -->
      <!-- Center 1: Low pressure trough / cyclone -->
      <g transform="translate(240, 180)">
        <ellipse cx="0" cy="0" rx="200" ry="110" fill="none" stroke="rgba(0, 240, 255, 0.3)" stroke-width="1.5" stroke-dasharray="6,2" />
        <ellipse cx="0" cy="0" rx="140" ry="80" fill="none" stroke="rgba(0, 240, 255, 0.5)" stroke-width="1.5" />
        <ellipse cx="0" cy="0" rx="80" ry="45" fill="none" stroke="rgba(255, 0, 84, 0.6)" stroke-width="2" />
        <circle cx="0" cy="0" r="16" fill="rgba(255, 0, 84, 0.2)" stroke="#ff0054" stroke-width="2" />
        <text x="0" y="5" fill="#ff0054" font-size="13" font-weight="bold" text-anchor="middle">L</text>
        <text x="50" y="-30" fill="#00f0ff" font-size="10">992 hPa</text>
        <text x="100" y="-60" fill="#00f0ff" font-size="10">1004 hPa</text>
      </g>

      <!-- Center 2: High pressure ridge -->
      <g transform="translate(600, 150)">
        <ellipse cx="0" cy="0" rx="180" ry="100" fill="none" stroke="rgba(58, 134, 255, 0.3)" stroke-width="1.5" />
        <ellipse cx="0" cy="0" rx="110" ry="60" fill="none" stroke="rgba(58, 134, 255, 0.6)" stroke-width="1.5" />
        <circle cx="0" cy="0" r="16" fill="rgba(58, 134, 255, 0.2)" stroke="#3a86ff" stroke-width="2" />
        <text x="0" y="5" fill="#3a86ff" font-size="13" font-weight="bold" text-anchor="middle">H</text>
        <text x="-90" y="-40" fill="#3a86ff" font-size="10">1020 hPa</text>
        <text x="-40" y="-10" fill="#3a86ff" font-size="10">1028 hPa</text>
      </g>

      <!-- Cold Front Line (Blue Triangles) -->
      <path d="M 280,70 Q 320,180 390,320" fill="none" stroke="#3a86ff" stroke-width="3" />
      <polygon points="305,120 317,112 312,128" fill="#3a86ff" />
      <polygon points="332,190 344,182 339,198" fill="#3a86ff" />
      <polygon points="365,260 377,252 372,268" fill="#3a86ff" />

      <!-- Warm Front Line (Red Semi-circles) -->
      <path d="M 120,290 Q 200,240 280,260" fill="none" stroke="#ff0054" stroke-width="3" />
      <circle cx="180" cy="254" r="6" fill="#ff0054" />
      <circle cx="240" cy="250" r="6" fill="#ff0054" />

      <!-- Wind Vectors (Arrows) -->
      <g transform="translate(180, 110) rotate(120)">
        <line x1="0" y1="0" x2="35" y2="0" stroke="#00f0ff" stroke-width="2" />
        <polygon points="35,0 26,-4 26,4" fill="#00f0ff" />
      </g>
      <g transform="translate(480, 260) rotate(-45)">
        <line x1="0" y1="0" x2="40" y2="0" stroke="#ffbe0b" stroke-width="2" />
        <polygon points="40,0 30,-4 30,4" fill="#ffbe0b" />
      </g>
      <g transform="translate(620, 310) rotate(-30)">
        <line x1="0" y1="0" x2="32" y2="0" stroke="#ffbe0b" stroke-width="2" />
        <polygon points="32,0 23,-4 23,4" fill="#ffbe0b" />
      </g>

      <!-- Current Location Station Symbol -->
      <g transform="translate(400, 190)">
        <circle cx="0" cy="0" r="14" fill="#070d18" stroke="#00f0ff" stroke-width="2" />
        <text x="0" y="5" font-size="12" text-anchor="middle">${meta.icon}</text>
        <rect x="-65" y="22" width="130" height="24" rx="4" fill="rgba(14,23,38,0.85)" stroke="rgba(0,240,255,0.3)" />
        <text x="0" y="38" fill="#e2eafc" font-size="11" font-weight="bold" text-anchor="middle">气压观测点: ${cur.pressureHpa} hPa</text>
      </g>
    </svg>
  `;

  container.innerHTML = `
    <div class="met-app">
      <header class="met-header">
        <div class="met-brand">
          <div class="radar-icon">📡</div>
          <div>
            <h1>情绪天气台 · 心灵气象图系统</h1>
            <p>PSYCHOLOGICAL METEOROLOGICAL OBSERVATORY &amp; SYNOPTIC CHART</p>
          </div>
        </div>
        <div class="met-header-actions">
          <button class="btn-reset" id="btnReset">🔄 重置示例气象序列</button>
          <button class="btn-record-mood" id="btnOpenLog">✍️ 记录今日心情天气</button>
        </div>
      </header>

      ${
        chartData.alerts.length > 0
          ? `
        <div class="alert-banner">
          <div class="alert-banner-left">
            <span class="alert-tag">${chartData.alerts[0].level}预警</span>
            <strong>${esc(chartData.alerts[0].title)}</strong>
            <span style="font-size:13px;color:var(--met-text);">${esc(chartData.alerts[0].triggerCause)}</span>
          </div>
          <span style="font-size:12px;color:var(--met-muted);">${chartData.alerts[0].issuedTime} 发布</span>
        </div>
      `
          : ''
      }

      ${
        recoveryReport
          ? `
        <div class="recovery-banner ${recoveryReport.status}">
          <div class="recovery-body">
            <div class="recovery-title">
              ${recoveryReport.status === 'corrupted' ? '🧯 本地档案已损坏，按空档案降级打开' : '🛠️ 本地档案已按记录降级恢复'}
            </div>
            <div class="recovery-summary">
              ${esc(recoveryReport.messages.join(' '))}
              ${
                recoveryReport.totalStored > 0
                  ? `共检测 ${recoveryReport.totalStored} 条存储记录：保留 ${recoveryReport.keptCount} 条、修复 ${recoveryReport.repairedCount} 条、忽略 ${recoveryReport.droppedCount} 条。`
                  : ''
              }
              剩余数据可正常查看与继续编辑。
            </div>
            ${
              recoveryReport.entries.length > 0
                ? `
              <ul class="recovery-entry-list">
                ${recoveryReport.entries
                  .slice(0, 6)
                  .map(
                    e => `
                  <li>
                    <span class="recovery-entry-action ${e.action}">${e.action === 'dropped' ? '已忽略' : '已修复'}</span>
                    第 ${e.index + 1} 条${e.date ? `（${esc(e.date)}）` : ''}${e.tag ? `「${esc(e.tag)}」` : ''}：${esc(e.reasons.join('；'))}
                  </li>
                `
                  )
                  .join('')}
                ${recoveryReport.entries.length > 6 ? `<li>…另有 ${recoveryReport.entries.length - 6} 条处理明细未展开</li>` : ''}
              </ul>
            `
                : ''
            }
          </div>
          <button type="button" class="recovery-dismiss" id="btnDismissRecovery">知道了</button>
        </div>
      `
          : ''
      }

      <div class="met-grid">
        <!-- Left: Synoptic Chart & Telemetry -->
        <main class="synoptic-box">
          <div class="box-title">
            <h2>🌐 个人专属情绪综观天气图 (Synoptic Chart)</h2>
            <span style="font-size:12px;color:var(--met-muted);font-family:monospace;">
              ${chartData.chartId} · ${chartData.generatedDate}
            </span>
          </div>

          <!-- Current Telemetry -->
          <div class="current-telemetry">
            <div class="telemetry-card">
              <div class="lbl">心境气压 (Barometer)</div>
              <div class="val" style="color:var(--met-cyan);">${cur.pressureHpa} <span style="font-size:12px;">hPa</span></div>
              <div class="lbl">${cur.pressureHpa < 1000 ? '低压对流' : '高压反气旋'}</div>
            </div>
            <div class="telemetry-card">
              <div class="lbl">情绪温度 (Temperature)</div>
              <div class="val" style="color:var(--met-gold);">${cur.temperatureC} <span style="font-size:12px;">°C</span></div>
              <div class="lbl">体感适宜度良好</div>
            </div>
            <div class="telemetry-card">
              <div class="lbl">心理湿度 (Humidity)</div>
              <div class="val" style="color:var(--met-blue);">${cur.humidityPercent}%</div>
              <div class="lbl">${cur.humidityPercent > 80 ? '湿润多云' : '清爽干燥'}</div>
            </div>
            <div class="telemetry-card">
              <div class="lbl">思绪风场 (Wind Field)</div>
              <div class="val" style="color:#fff;">${cur.windDirectionName}风</div>
              <div class="lbl">${cur.windSpeedKmH} km/h</div>
            </div>
          </div>

          <!-- SVG Weather Map -->
          <div class="synoptic-map-wrap">
            ${isobarsSvg}
          </div>

          <div class="map-legend">
            <div class="legend-item"><div class="legend-color" style="background:#ff0054;"></div><span>低压中心 (L) / 气旋雨带</span></div>
            <div class="legend-item"><div class="legend-color" style="background:#3a86ff;"></div><span>高压中心 (H) / 晴朗平稳</span></div>
            <div class="legend-item"><div class="legend-color" style="background:#00f0ff;"></div><span>等压线 (Isobars)</span></div>
            <div class="legend-item"><div class="legend-color" style="background:#ffbe0b;"></div><span>风向矢量箭头</span></div>
          </div>

          <!-- Recent Days Sequence Strip -->
          <div class="timeline-section">
            <h3>📅 近期气象观测序列 (点击切换观测标本)</h3>
            <div class="records-strip">
              ${chartData.records
                .map(
                  r => `
                <div class="record-pill ${r.id === cur.id ? 'active' : ''}" data-id="${r.id}">
                  <div class="pill-date">${r.date.slice(5)}</div>
                  <div class="pill-icon">${(TAG_METAS[r.tag] || TAG_METAS['阴转多云']).icon}</div>
                  <div class="pill-tag">${esc(r.tag)}</div>
                  <div class="pill-pressure">${r.pressureHpa} hPa</div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </main>

        <!-- Right: Zones, Monsoon, Alerts -->
        <aside class="right-column">
          <!-- Barometric Zones -->
          <section class="side-panel">
            <h3>🧭 情绪气压带分布</h3>
            <div class="zone-list">
              ${chartData.zones
                .map(
                  z => `
                <div class="zone-card">
                  <div class="zone-header">
                    <span class="zone-name">${esc(z.name)}</span>
                    <span class="zone-ratio">${z.activeRatio}% 频次</span>
                  </div>
                  <div class="zone-progress-bg">
                    <div class="zone-progress-fill" style="width: ${z.activeRatio}%"></div>
                  </div>
                  <div class="zone-desc">${esc(z.psychologicalState)}</div>
                </div>
              `
                )
                .join('')}
            </div>
          </section>

          <!-- Monsoon Trends -->
          <section class="side-panel">
            <h3>🌬️ 季风走势与大气环流</h3>
            <div class="monsoon-card">
              <div class="monsoon-vector-title">
                <span>🍃</span>
                <span>${esc(chartData.monsoon.vectorName)}</span>
              </div>
              <div class="monsoon-meta">
                <div>流场源动力：${esc(chartData.monsoon.originSource)}</div>
                <div>流动强度：${chartData.monsoon.flowSpeed}</div>
              </div>
              <div class="monsoon-forecast-box">
                <strong>未来三日气象推演：</strong>
                <div>${esc(chartData.monsoon.upcomingForecast)}</div>
              </div>
            </div>
          </section>

          <!-- Extreme Weather Alerts -->
          <section class="side-panel">
            <h3>⚠️ 极端天气预警与自愈指南</h3>
            <div class="alerts-list">
              ${
                chartData.alerts.length > 0
                  ? chartData.alerts
                      .map(
                        a => `
                    <div class="alert-item ${a.level}">
                      <div class="alert-title-row">
                        <span class="alert-name">${esc(a.title)}</span>
                        <span class="alert-level-badge" style="background:rgba(255,255,255,0.1);color:#fff;">${a.level}</span>
                      </div>
                      <div class="alert-cause">${esc(a.triggerCause)}</div>
                      <div class="defense-guide-title">🛡️ 防灾避险自愈协议：</div>
                      <ul class="defense-list">
                        ${a.defenseProtocol.map(p => `<li>${esc(p)}</li>`).join('')}
                      </ul>
                    </div>
                  `
                      )
                      .join('')
                  : `
                    <div style="font-size:13px;color:var(--met-muted);background:var(--met-card);padding:14px;border-radius:8px;">
                      ✅ 当前心境空域晴朗，无活动极端灾害天气警报。
                    </div>
                  `
              }
            </div>
          </section>
        </aside>
      </div>

      <!-- Modal: Record Daily Mood Weather -->
      ${
        isModalOpen
          ? `
        <div class="modal-backdrop" id="modalBackdrop">
          <div class="modal-dialog">
            <h3>✍️ 今日心情气象签到</h3>
            
            <label style="font-size:12px;color:var(--met-muted);display:block;margin-bottom:8px;">选择今日核心气象标签：</label>
            <div class="tag-selector-grid">
              ${Object.values(TAG_METAS)
                .map(
                  m => `
                <button type="button" class="tag-btn ${m.tag === selectedTag ? 'active' : ''}" data-tag="${m.tag}">
                  <span style="font-size:16px;">${m.icon}</span>
                  <span>${m.tag}</span>
                </button>
              `
                )
                .join('')}
            </div>

            <div class="form-group">
              <label>气象对流强度 (1 - 10 级)：<span id="intensityVal" style="color:var(--met-cyan);font-weight:bold;">${selectedIntensity}</span></label>
              <input type="range" class="form-range" id="intensityInput" min="1" max="10" value="${selectedIntensity}" />
            </div>

            <div class="form-group">
              <label>观测记录与心绪注记：</label>
              <textarea class="form-textarea" id="noteInput" placeholder="写下引起今天气压变化的事情或思绪...">${esc(noteText)}</textarea>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-reset" id="btnCancelModal">取消</button>
              <button type="button" class="btn-record-mood" id="btnSubmitModal">保存并更新气象图</button>
            </div>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;

  // Attach event listeners
  container.querySelector('#btnOpenLog')?.addEventListener('click', handlers.onOpenLogModal);
  container.querySelector('#btnReset')?.addEventListener('click', handlers.onResetData);
  container.querySelector('#btnDismissRecovery')?.addEventListener('click', onDismissRecovery);

  container.querySelectorAll('.record-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const id = pill.getAttribute('data-id');
      const rec = chartData.records.find(r => r.id === id);
      if (rec) handlers.onSelectRecord(rec);
    });
  });

  if (isModalOpen) {
    container.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        if (tag) onTagChange(tag);
      });
    });

    const intensitySlider = container.querySelector('#intensityInput') as HTMLInputElement;
    if (intensitySlider) {
      intensitySlider.addEventListener('input', () => {
        onIntensityChange(parseInt(intensitySlider.value, 10));
      });
    }

    const noteBox = container.querySelector('#noteInput') as HTMLTextAreaElement;
    if (noteBox) {
      noteBox.addEventListener('input', () => {
        onNoteChange(noteBox.value);
      });
    }

    container.querySelector('#btnCancelModal')?.addEventListener('click', onCloseModal);
    container.querySelector('#modalBackdrop')?.addEventListener('click', e => {
      if (e.target === container.querySelector('#modalBackdrop')) {
        onCloseModal();
      }
    });

    container.querySelector('#btnSubmitModal')?.addEventListener('click', () => {
      handlers.onSubmitLog(selectedTag, selectedIntensity, noteText);
    });
  }
}
