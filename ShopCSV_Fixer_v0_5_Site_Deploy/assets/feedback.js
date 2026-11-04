(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = $('feedback-status');
  function compose() {
    const pain = $('pain').value.trim();
    if (!pain) throw new Error('Please describe one problem before copying or downloading feedback.');
    if (pain.length > 1000) throw new Error('Feedback must be 1000 characters or fewer.');
    return [
      'ShopCSV Fixer v0.5 beta feedback',
      'Role: ' + $('role').value,
      'CSV frequency: ' + $('frequency').value,
      'Mapping value: ' + $('value').value,
      'Problem:',
      pain,
      '',
      'No files, product data, or other information attached.'
    ].join('\n');
  }
  $('feedback-copy').addEventListener('click', async () => {
    try {
      const note = compose();
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard is unavailable here. Use Download feedback note instead.');
      await navigator.clipboard.writeText(note);
      status.textContent = 'Copied locally. Nothing was sent. Share it manually with the project owner.';
    } catch (err) {status.textContent = err.message;}
  });
  $('feedback-download').addEventListener('click', () => {
    try {
      const note = compose();
      const blob = new Blob([note], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'shopcsv_beta_feedback.txt'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      status.textContent = 'Feedback note downloaded to your device. Nothing was sent automatically.';
    } catch (err) {status.textContent = err.message;}
  });
})();
