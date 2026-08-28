/**
 * Browser (client) half of dsh-godot-sprite.
 *
 * Registers a settings card under `settings.plugin.item` keyed on the
 * `godot-sprite` settings namespace. Reads/writes through the settings scope
 * and API credentials, following the DSH client contract.
 *
 * NOTE: this file is the *source*. The packaged `lib/client.js` is produced by
 * `scripts/build-client.mjs` into the DSH loader lazy-CJS factory format.
 */

import { createElement as h, useState, useEffect } from 'react';

const NAMESPACE = 'godot-sprite';

const PROVIDERS = [
  { id: 'gemini_flash', name: 'Google Gemini Flash', free: true },
  { id: 'stable_diffusion', name: 'Stable Diffusion', free: true },
  { id: 'openai', name: 'OpenAI DALL-E 3', free: false },
  { id: 'seedream', name: 'Seedream', free: false },
  { id: 'agnes', name: 'Agnes AI', free: false },
  { id: 'deepseek', name: 'DeepSeek', free: false },
  { id: 'minimax', name: 'MiniMax', free: false },
  { id: 'flux', name: 'Flux (Black Forest Labs)', free: false },
  { id: 'baidu_ernie', name: 'Baidu Wenxin Yige (文心一格)', free: false },
  { id: 'tencent_hunyuan', name: 'Tencent Hunyuan (混元)', free: false },
  { id: 'aliyun_wanx', name: 'Aliyun Wanxiang (通义万相)', free: false },
  { id: 'custom', name: 'Custom (OpenAI Compatible)', free: false }
];

const CREDENTIAL_REF = (providerId) => `godot-sprite:${providerId}`;

const STYLE = `
.dsh-gs-card{list-style:none;margin:0;border:1px solid #e3e3e3;border-radius:8px;overflow:hidden;background:var(--ds-bg,#fff)}
.dsh-gs-card+.dsh-gs-card{margin-top:8px}
.dsh-gs-head{display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 16px;border:0;background:none;cursor:pointer;text-align:left;color:inherit;font:inherit}
.dsh-gs-title{font-weight:600;font-size:14px}
.dsh-gs-desc{display:block;font-size:12px;color:var(--ds-fg-muted,#777);margin-top:2px}
.dsh-gs-chevron{transition:transform .15s}
.dsh-gs-chevron.dsh-gs-open{transform:rotate(90deg)}
.dsh-gs-body{padding:0 16px 16px}
.dsh-gs-body[hidden]{display:none}
.dsh-gs-field{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #f0f0f0}
.dsh-gs-field label{font-size:13px}
.dsh-gs-badge{font-size:11px;padding:2px 6px;border-radius:4px;background:#5cc97f22;color:#2f9e44}
.dsh-gs-input{flex:1;min-width:0;padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;background:var(--ds-bg-input,transparent);color:inherit}
.dsh-gs-btn{padding:6px 12px;border:1px solid #d0d0d0;border-radius:6px;background:transparent;cursor:pointer;font-size:13px;color:inherit}
.dsh-gs-btn.dsh-gs-primary{background:var(--ds-accent,#2f6fed);border-color:var(--ds-accent,#2f6fed);color:#fff}
.dsh-gs-select{padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;background:var(--ds-bg-input,transparent);color:inherit}
.dsh-gs-msg{font-size:12px;color:#2f9e44;margin-top:8px}
.dsh-gs-msg.err{color:#d64545}
.dsh-gs-note{font-size:11px;color:var(--ds-fg-muted,#777);margin-top:8px}
`;

function GodotSpriteSettingsCard(props) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => props.scope.getSnapshot());
  const [editing, setEditing] = useState(null);
  const [tempKey, setTempKey] = useState('');
  const [message, setMessage] = useState('');
  const [msgErr, setMsgErr] = useState(false);

  useEffect(() => props.scope.subscribe(() => setSnapshot(props.scope.getSnapshot())), [props.scope]);

  const value = snapshot.value || {};
  const defaultProvider = value.defaultProvider || 'gemini_flash';
  const spriteSheet = value.spriteSheet || {};

  const saveKey = async (providerId, keyValue) => {
    setMessage('');
    setMsgErr(false);
    try {
      if (keyValue && keyValue.trim().length > 0) {
        const response = await props.credentials.set({ ref: CREDENTIAL_REF(providerId), value: keyValue.trim() });
        if (!response.result.ok) throw new Error(response.result.error?.message || 'save failed');
      }
      setEditing(null);
      setTempKey('');
      setMessage('已保存 API Key');
    } catch (err) {
      setMessage(String(err?.message || err));
      setMsgErr(true);
    }
  };

  const saveDefaults = async () => {
    setMessage('');
    setMsgErr(false);
    try {
      await props.scope.set('defaultProvider', defaultProvider);
      setMessage('已保存默认设置');
    } catch (err) {
      setMessage(String(err?.message || err));
      setMsgErr(true);
    }
  };

  return h('li', { className: 'dsh-gs-card' }, [
    h('button', {
      type: 'button',
      className: 'dsh-gs-head',
      'aria-expanded': open,
      onClick: () => setOpen((v) => !v)
    }, [
      h('span', null, [
        h('span', { className: 'dsh-gs-title' }, 'Godot Sprite 插件'),
        h('span', { className: 'dsh-gs-desc' }, 'AI 图片生成与精灵图配置')
      ]),
      h('span', { className: `dsh-gs-chevron ${open ? 'dsh-gs-open' : ''}`, 'aria-hidden': 'true' }, '›')
    ]),
    h('div', { className: 'dsh-gs-body', hidden: !open }, [
      h('h4', { style: { margin: '8px 0' } }, 'API Key'),
      ...PROVIDERS.map((p) => h('div', { key: p.id, className: 'dsh-gs-field' }, [
        h('label', null, [
          p.name,
          p.free ? h('span', { className: 'dsh-gs-badge', style: { marginLeft: '6px' } }, '免费') : null
        ]),
        editing === p.id
          ? h('div', { style: { display: 'flex', gap: '6px' } }, [
              h('input', {
                type: 'password',
                className: 'dsh-gs-input',
                value: tempKey,
                placeholder: '输入 API Key',
                onChange: (e) => setTempKey(e.target.value)
              }),
              h('button', { className: 'dsh-gs-btn dsh-gs-primary', onClick: () => saveKey(p.id, tempKey) }, '保存'),
              h('button', { className: 'dsh-gs-btn', onClick: () => { setEditing(null); setTempKey(''); } }, '取消')
            ])
          : h('button', { className: 'dsh-gs-btn', onClick: () => { setEditing(p.id); setTempKey(''); } }, '配置')
      ])),
      h('h4', { style: { margin: '12px 0 4px' } }, '默认设置'),
      h('div', { className: 'dsh-gs-field' }, [
        h('label', null, '默认提供商'),
        h('select', {
          className: 'dsh-gs-select',
          value: defaultProvider,
          onChange: (e) => props.scope.set('defaultProvider', e.target.value)
        }, PROVIDERS.map((p) => h('option', { key: p.id, value: p.id }, p.name)))
      ]),
      h('div', { style: { fontSize: '12px', color: '#777', marginTop: '4px' } }, `精灵图默认: ${spriteSheet.defaultGridCols || 4}x${spriteSheet.defaultGridRows || 4} 网格`),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, [
        h('button', { className: 'dsh-gs-btn dsh-gs-primary', onClick: saveDefaults }, '保存设置')
      ]),
      message ? h('div', { className: `dsh-gs-msg${msgErr ? ' err' : ''}` }, message) : null,
      h('div', { className: 'dsh-gs-note' }, 'API Key 存储于 DSH 凭据;完整网格参数与更多设置可在对话中使用 godot_sprite_config 工具管理。')
    ])
  ]);
}

const inject = ['slots', 'connection', 'remote', 'settingsScope', 'locale'];

function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE });
  const { api } = ctx.get('connection');

  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = NAMESPACE;
    style.textContent = STYLE;
    document.head.appendChild(style);
    return () => style.remove();
  }, `${NAMESPACE}: styles`);

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NAMESPACE,
    locale: 'settings.godotSprite',
    inject: () => ({
      scope,
      credentials: api.credentials,
      locale: ctx.get('locale')
    })
  }, GodotSpriteSettingsCard));
}

export { GodotSpriteSettingsCard, apply, inject };
export const name = 'godot-sprite-client';
