const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { translate } = require('@vitalets/google-translate-api');

/* ═══════════════════════════════════════════
   🌐 Translation Command
   Translates any language to Hindi or English
   Auto-detects source language
   ═══════════════════════════════════════════ */

const LANG_FLAGS = {
  auto: '🔍', hi: '🇮🇳', en: '🇬🇧', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳', fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸', pt: '🇵🇹',
  it: '🇮🇹', ru: '🇷🇺', ar: '🇸🇦', tr: '🇹🇷', th: '🇹🇭', vi: '🇻🇳', id: '🇮🇩', ms: '🇲🇾', nl: '🇳🇱', pl: '🇵🇱',
  sv: '🇸🇪', da: '🇩🇰', fi: '🇫🇮', no: '🇳🇴', el: '🇬🇷', he: '🇮🇱', cs: '🇨🇿', ro: '🇷🇴', hu: '🇭🇺', uk: '🇺🇦',
  bn: '🇧🇩', ta: '🇮🇳', te: '🇮🇳', mr: '🇮🇳', gu: '🇮🇳', kn: '🇮🇳', ml: '🇮🇳', pa: '🇮🇳', ur: '🇵🇰',
};

const LANG_NAMES = {
  auto: 'Auto-detect', hi: 'Hindi', en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', it: 'Italian', ru: 'Russian',
  ar: 'Arabic', tr: 'Turkish', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay',
  nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian',
  el: 'Greek', he: 'Hebrew', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', uk: 'Ukrainian',
  bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada',
  ml: 'Malayalam', pa: 'Punjabi', ur: 'Urdu',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tr')
    .setDescription('🌐 Translate text to any language')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('The text to translate')
        .setRequired(true)
        .setMaxLength(2000))
    .addStringOption(option =>
      option.setName('to')
        .setDescription('Target language (default: Hindi)')
        .setRequired(false)
        .addChoices(
          { name: '🇮🇳 Hindi', value: 'hi' },
          { name: '🇬🇧 English', value: 'en' },
          { name: '🇯🇵 Japanese', value: 'ja' },
          { name: '🇰🇷 Korean', value: 'ko' },
          { name: '🇨🇳 Chinese', value: 'zh' },
          { name: '🇫🇷 French', value: 'fr' },
          { name: '🇩🇪 German', value: 'de' },
          { name: '🇪🇸 Spanish', value: 'es' },
          { name: '🇵🇹 Portuguese', value: 'pt' },
          { name: '🇮🇹 Italian', value: 'it' },
          { name: '🇷🇺 Russian', value: 'ru' },
          { name: '🇸🇦 Arabic', value: 'ar' },
          { name: '🇹🇷 Turkish', value: 'tr' },
          { name: '🇹🇭 Thai', value: 'th' },
          { name: '🇻🇳 Vietnamese', value: 'vi' },
          { name: '🇮🇩 Indonesian', value: 'id' },
          { name: '🇧🇩 Bengali', value: 'bn' },
          { name: '🇵🇰 Urdu', value: 'ur' },
          { name: '🇮🇳 Tamil', value: 'ta' },
          { name: '🇮🇳 Punjabi', value: 'pa' },
        ))
    .addStringOption(option =>
      option.setName('from')
        .setDescription('Source language (default: auto-detect)')
        .setRequired(false)
        .addChoices(
          { name: '🔍 Auto-detect', value: 'auto' },
          { name: '🇮🇳 Hindi', value: 'hi' },
          { name: '🇬🇧 English', value: 'en' },
          { name: '🇯🇵 Japanese', value: 'ja' },
          { name: '🇰🇷 Korean', value: 'ko' },
          { name: '🇨🇳 Chinese', value: 'zh' },
          { name: '🇫🇷 French', value: 'fr' },
          { name: '🇩🇪 German', value: 'de' },
          { name: '🇪🇸 Spanish', value: 'es' },
          { name: '🇸🇦 Arabic', value: 'ar' },
          { name: '🇹🇷 Turkish', value: 'tr' },
          { name: '🇵🇰 Urdu', value: 'ur' },
        )),

  async execute(interaction) {
    const text = interaction.options.getString('text');
    const toLang = interaction.options.getString('to') || 'hi';
    const fromLang = interaction.options.getString('from') || 'auto';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await translate(text, { from: fromLang === 'auto' ? undefined : fromLang, to: toLang });

      const srcFlag = LANG_FLAGS[result.from.language.iso] || '🔍';
      const tgtFlag = LANG_FLAGS[toLang] || '🌐';
      const srcName = LANG_NAMES[result.from.language.iso] || result.from.language.iso.toUpperCase();
      const tgtName = LANG_NAMES[toLang] || toLang.toUpperCase();

      // Confidence indicator
      const confidence = result.from.language.confidence;
      const confPercent = confidence ? `${Math.round(confidence * 100)}%` : 'N/A';

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🌐 Translation')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ ${srcFlag} **From:** ${srcName}${fromLang === 'auto' ? ` (${confPercent} confident)` : ''}\n` +
          `┣ ${tgtFlag} **To:** ${tgtName}\n` +
          `┗ 📝 **Original:**\n> ${text.length > 500 ? text.slice(0, 500) + '...' : text}`
        )
        .addFields({
          name: `${tgtFlag} Translation`,
          value: result.text.length > 1024 ? result.text.slice(0, 1020) + '...' : result.text,
        })
        .setFooter({ text: `💕 Abigail Translator • ${srcName} → ${tgtName}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Translation error:', error.message);
      await interaction.editReply({
        content: `❌ Translation failed: ${error.message}\n\n💡 Try shorter text or a different language.`,
      });
    }
  },
};
