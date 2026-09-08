import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Server,
  Cpu,
  HardDrive,
  Shield,
  Eye,
  X,
  Table as TableIcon,
  LayoutGrid,
  Zap
} from 'lucide-react';
import { api } from '../services/api';

const REGIONS = [
  { id: 'us', name: 'United States', flag: '🇺🇸' },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧' },
  { id: 'eu', name: 'Europe (Germany/NL)', flag: '🇪🇺' },
  { id: 'in', name: 'India', flag: '🇮🇳' },
  { id: 'sg', name: 'Singapore', flag: '🇸🇬' },
  { id: 'au', name: 'Australia', flag: '🇦🇺' },
  { id: 'jp', name: 'Japan', flag: '🇯🇵' },
  { id: 'global', name: 'All Regions', flag: '🌍' }
];

function copyTextToClipboard(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.warn('execCommand failed, trying navigator.clipboard:', err);
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch((e) => console.warn('Clipboard writeText failed:', e));
    return true;
  }
  return false;
}

export default function PlansView() {
  const [plans, setPlans] = useState([]);
  const [priceMatrix, setPriceMatrix] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('us');
  const [copiedAll, setCopiedAll] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [previewText, setPreviewText] = useState(null);
  const [viewLayout, setViewLayout] = useState('table'); // Default to comparison table
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPlans()
      .then((data) => {
        if (data?.plans) setPlans(data.plans);
        if (data?.priceMatrix) setPriceMatrix(data.priceMatrix);
      })
      .catch((err) => console.error('Failed to load plans:', err))
      .finally(() => setLoading(false));
  }, []);

  const currentRegionObj = REGIONS.find((r) => r.id === selectedRegion) || REGIONS[0];

  const getPrice = (planId, regionId) => {
    const r = (regionId || 'us').toLowerCase();
    const matrixRegion = r === 'global' ? 'eu' : r;
    const price = priceMatrix[planId]?.[matrixRegion] || priceMatrix[planId]?.['eu'] || 1500;
    return Number(price);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Generate single plan quote text
  const getSinglePlanText = (plan) => {
    const price = getPrice(plan.id, selectedRegion);
    return `*${plan.name} Dedicated Windows RDP (${currentRegionObj.flag} ${currentRegionObj.name})*\n` +
      `• CPU: ${plan.vcpu || plan.cpu || 'Multi-core'}\n` +
      `• RAM: ${plan.ram}\n` +
      `• NVMe Storage: ${plan.nvme || plan.storage || 'Fast NVMe'}\n` +
      `• Uplink: 1 Gbps Port (Unmetered Bandwidth)\n` +
      `• Dedicated Private IP (100% Dedicated)\n` +
      `• Price: ₨${price.toLocaleString()}/month\n` +
      `• Region: ${currentRegionObj.flag} ${currentRegionObj.name}\n` +
      `• Delivery: 30 minutes after payment verification\n` +
      `• Payments: JazzCash, Raast, NayaPay, UBL Bank Transfer`;
  };

  const copyPlanDetails = (plan) => {
    const text = getSinglePlanText(plan);
    copyTextToClipboard(text);
    setCopiedId(plan.id);
    showToast(`✅ Copied ${plan.name} quote to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getAllPlansText = () => {
    let text = `💵 *PAKCLOUDRDP — COMPLETE PRICE & SPECS LIST (${currentRegionObj.flag} ${currentRegionObj.name})*\n` +
      `*(100% Dedicated Machine · Dedicated Private IP · 1 Gbps Port · Unmetered)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    plans.forEach((p, idx) => {
      const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][idx] || '•';
      const star = p.id === 'starter' ? ' ⭐ *(Most Popular)*' : '';
      const price = getPrice(p.id, selectedRegion);
      const vcpu = p.vcpu || p.cpu || '';
      const nvme = p.nvme || p.storage || '';
      text += `${numEmoji} *${p.name}*: ${vcpu} · ${p.ram} RAM · ${nvme} ➔ *₨${price.toLocaleString()}/mo*${star}\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 *Selected Region:* ${currentRegionObj.flag} ${currentRegionObj.name}\n` +
      `⚡ *Setup Time:* 30 Minutes after payment confirmation\n` +
      `💳 *Payment Accounts:* JazzCash, Raast, NayaPay, UBL Bank\n\n` +
      `Aapko inme se kaunsa plan aur use-case k liye chahiye? 🚀`;

    return text;
  };

  const copyAllPlansForRegion = () => {
    if (!plans.length) return;
    const text = getAllPlansText();
    copyTextToClipboard(text);
    setCopiedAll(true);
    showToast(`✅ Copied all ${plans.length} plans for ${currentRegionObj.name}!`);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading pricing matrix...</div>;
  }

  return (
    <div className="plans-page-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="plans-toast" role="status" aria-live="polite">
          <Check size={18} color="var(--emerald)" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Quote Preview Modal */}
      {previewText && (
        <div className="preview-modal-overlay">
          <div className="preview-modal-card" role="dialog" aria-modal="true" aria-label="Formatted WhatsApp Quote Preview">
            <div className="preview-modal-header">
              <h3 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>Formatted Customer Quote ({currentRegionObj.name})</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPreviewText(null)}
                aria-label="Close quote preview"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <textarea
              readOnly
              className="preview-textarea"
              value={previewText}
              rows={12}
              aria-label="Preview text content"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  copyTextToClipboard(previewText);
                  showToast('✅ Copied quote text!');
                  setPreviewText(null);
                }}
                aria-label="Copy previewed quote"
              >
                <Copy size={15} aria-hidden="true" />
                <span>Copy & Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control Bar: Region Selection & Action Buttons */}
      <div className="plans-control-bar">
        <div className="region-selector-block">
          <span className="region-label">Region for Customer Quote:</span>
          <div className="region-pills-wrap" role="group" aria-label="Select pricing region">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`region-pill ${selectedRegion === r.id ? 'active' : ''}`}
                onClick={() => setSelectedRegion(r.id)}
                aria-label={`Select ${r.name} pricing region`}
              >
                <span aria-hidden="true">{r.flag}</span>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="plans-action-controls">
          {/* Layout View Toggle (Comparison Table vs Cards) */}
          <div className="layout-toggle-group" role="group" aria-label="Toggle layout view">
            <button
              type="button"
              className={`layout-toggle-btn ${viewLayout === 'table' ? 'active' : ''}`}
              onClick={() => setViewLayout('table')}
              title="Comparison Table View"
              aria-label="Switch to Comparison Table View"
            >
              <TableIcon size={15} aria-hidden="true" />
              <span>Table</span>
            </button>
            <button
              type="button"
              className={`layout-toggle-btn ${viewLayout === 'cards' ? 'active' : ''}`}
              onClick={() => setViewLayout('cards')}
              title="Card Grid View"
              aria-label="Switch to Card Grid View"
            >
              <LayoutGrid size={15} aria-hidden="true" />
              <span>Cards</span>
            </button>
          </div>

          <button
            type="button"
            className="icon-btn text-preview-btn"
            title="Preview formatted text quote"
            aria-label="Preview formatted text quote"
            onClick={() => setPreviewText(getAllPlansText())}
          >
            <Eye size={15} aria-hidden="true" />
            <span>Preview Text</span>
          </button>

          <button
            type="button"
            className="btn-primary copy-all-btn"
            onClick={copyAllPlansForRegion}
            aria-label={`Copy all plans for ${currentRegionObj.name}`}
          >
            {copiedAll ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>{copiedAll ? 'Copied All Plans!' : `Copy All (${currentRegionObj.flag})`}</span>
          </button>
        </div>
      </div>

      {/* COMPARISON TABLE VIEW (Solves the awkward 5+2 orphan card row) */}
      {viewLayout === 'table' ? (
        <div className="plans-table-wrapper" role="region" aria-label="Plans comparison table">
          <table className="plans-comparison-table">
            <thead>
              <tr>
                <th>Plan Name</th>
                <th>vCPU</th>
                <th>RAM</th>
                <th>Storage</th>
                <th>IP Type</th>
                <th>Port Uplink</th>
                <th>Price / mo ({currentRegionObj.id.toUpperCase()})</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const isFeatured = plan.id === 'starter';
                const isCopied = copiedId === plan.id;
                const price = getPrice(plan.id, selectedRegion);

                return (
                  <tr key={plan.id} className={isFeatured ? 'featured-plan-row' : ''}>
                    <td>
                      <div className="table-plan-cell">
                        <strong className="table-plan-name">{plan.name}</strong>
                        {isFeatured && (
                          <span className="featured-pill-badge" title="Most popular customer plan">
                            <Zap size={11} aria-hidden="true" /> Most Popular
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="spec-val"><Cpu size={13} color="var(--text-muted)" aria-hidden="true" /> {plan.vcpu || plan.cpu}</span>
                    </td>
                    <td>
                      <span className="spec-val"><Server size={13} color="var(--text-muted)" aria-hidden="true" /> {plan.ram}</span>
                    </td>
                    <td>
                      <span className="spec-val"><HardDrive size={13} color="var(--text-muted)" aria-hidden="true" /> {plan.nvme || plan.storage}</span>
                    </td>
                    <td>
                      <span className="spec-val"><Shield size={13} color="var(--text-muted)" aria-hidden="true" /> Dedicated Private</span>
                    </td>
                    <td>
                      <span className="spec-val">1 Gbps Unmetered</span>
                    </td>
                    <td>
                      <span className={`table-plan-price ${isFeatured ? 'featured-price' : ''}`}>
                        ₨{price.toLocaleString()}
                        <small>/mo</small>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={`table-copy-btn ${isCopied ? 'copied' : ''}`}
                        onClick={() => copyPlanDetails(plan)}
                        aria-label={`Copy quote for ${plan.name} plan`}
                      >
                        {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        <span>{isCopied ? 'Copied!' : 'Copy quote'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* OPTIONAL CARD VIEW: Clean, standardized colors */
        <div className="pricing-grid">
          {plans.map((plan) => {
            const isFeatured = plan.id === 'starter';
            const isCopied = copiedId === plan.id;
            const price = getPrice(plan.id, selectedRegion);

            return (
              <div key={plan.id} className={`plan-card ${isFeatured ? 'featured' : ''}`}>
                {isFeatured && <span className="plan-badge">⭐ Most Popular</span>}

                <div>
                  <h3 className="plan-name">{plan.name}</h3>
                  <div className={`plan-price ${isFeatured ? 'featured-price' : 'standard-price'}`}>
                    ₨{price.toLocaleString()}
                    <span>/ month</span>
                  </div>
                </div>

                <div className="plan-specs">
                  <div className="spec-row">
                    <span><Cpu size={14} color="var(--text-muted)" aria-hidden="true" /> vCPU</span>
                    <strong>{plan.vcpu || plan.cpu}</strong>
                  </div>
                  <div className="spec-row">
                    <span><Server size={14} color="var(--text-muted)" aria-hidden="true" /> RAM</span>
                    <strong>{plan.ram}</strong>
                  </div>
                  <div className="spec-row">
                    <span><HardDrive size={14} color="var(--text-muted)" aria-hidden="true" /> Storage</span>
                    <strong>{plan.nvme || plan.storage}</strong>
                  </div>
                  <div className="spec-row">
                    <span><Shield size={14} color="var(--text-muted)" aria-hidden="true" /> Dedicated IP</span>
                    <strong>Private Dedicated</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="copy-plan-btn"
                  onClick={() => copyPlanDetails(plan)}
                  aria-label={`Copy quote for ${plan.name}`}
                >
                  {isCopied ? <Check size={16} color="var(--emerald)" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  <span>{isCopied ? 'Copied!' : 'Copy quote'}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
