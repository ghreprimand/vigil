/**
 * Contextual Help System - inspect mode overlay
 *
 * Usage: elements with data-help="key" become clickable in help mode.
 * The help content is loaded from /api/v1/help-content (cached in memory).
 */
(function () {
  'use strict';

  var helpMode = false;
  var helpContent = null;   // cached after first fetch
  var activePopover = null; // currently visible popover element

  // - Bootstrap -

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Create the "?" toggle button
    var btn = document.createElement('button');
    btn.className = 'help-toggle';
    btn.setAttribute('aria-label', 'Toggle help mode');
    btn.setAttribute('title', 'Contextual help - click to inspect any element');
    btn.textContent = '?';
    btn.addEventListener('click', toggleHelpMode);
    document.body.appendChild(btn);

    // Create the banner
    var banner = document.createElement('div');
    banner.className = 'help-banner';
    banner.innerHTML = 'Help Mode - click any highlighted element for details. Press <kbd>Esc</kbd> to exit.';
    document.body.appendChild(banner);

    // Single delegated click handler on body (captures all clicks)
    document.body.addEventListener('click', onBodyClick, true);

    // Keyboard shortcut: Escape exits help mode
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && helpMode) {
        toggleHelpMode();
      }
    });
  }

  // - Mode Toggle -

  function toggleHelpMode() {
    helpMode = !helpMode;
    document.body.classList.toggle('help-mode', helpMode);
    document.querySelector('.help-toggle').classList.toggle('active', helpMode);

    if (helpMode) {
      loadHelpContent(); // preload
    } else {
      closePopover();
    }
  }

  // - Delegated Click Handler -

  function onBodyClick(e) {
    if (!helpMode) return;

    // Find the innermost data-help element at the click point
    var target = e.target;

    // Ignore clicks on the help toggle button itself
    if (target.closest && target.closest('.help-toggle')) return;
    // Ignore clicks inside the popover
    if (activePopover && activePopover.contains(target)) return;

    var helpEl = target.closest ? target.closest('[data-help]') : null;

    if (helpEl) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      var key = helpEl.getAttribute('data-help');
      showHelp(key, helpEl);
    } else {
      // Clicked outside any help element - close popover, prevent action
      e.preventDefault();
      e.stopPropagation();
      closePopover();
    }
  }

  // - Help Content Loading -

  function loadHelpContent() {
    if (helpContent) return;  // already loaded
    fetch('/api/v1/help-content')
      .then(function (r) { return r.json(); })
      .then(function (data) { helpContent = data; })
      .catch(function () { helpContent = {}; });
  }

  // - Popover Display -

  function showHelp(key, anchorEl) {
    closePopover();

    var entry = (helpContent || {})[key];
    if (!entry) {
      entry = {
        title: 'No Help Available',
        description: '<p>No contextual help has been written for this element yet.</p><p><code>' + key + '</code></p>',
      };
    }

    var popover = document.createElement('div');
    popover.className = 'help-popover';

    // Header
    var header = document.createElement('div');
    header.className = 'help-popover-header';

    var title = document.createElement('span');
    title.className = 'help-popover-title';
    title.textContent = entry.title;
    header.appendChild(title);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'help-popover-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closePopover();
    });
    header.appendChild(closeBtn);
    popover.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'help-popover-body';
    body.innerHTML = entry.description;
    popover.appendChild(body);

    // Footer (learn more link)
    if (entry.learnMore) {
      var footer = document.createElement('div');
      footer.className = 'help-popover-footer';
      var link = document.createElement('a');
      link.href = entry.learnMore;
      link.textContent = 'Learn more in Help \u2192';
      footer.appendChild(link);
      popover.appendChild(footer);
    }

    document.body.appendChild(popover);
    activePopover = popover;

    // Position near the anchor element
    positionPopover(popover, anchorEl);
  }

  function closePopover() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  function positionPopover(popover, anchor) {
    var rect = anchor.getBoundingClientRect();
    var pw = popover.offsetWidth;
    var ph = popover.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var gap = 8;

    // Try below the element
    var top = rect.bottom + gap;
    var left = rect.left + (rect.width / 2) - (pw / 2);

    // If below overflows, try above
    if (top + ph > vh - 20) {
      top = rect.top - ph - gap;
    }

    // If above overflows too, position at top of viewport
    if (top < 40) {
      top = 40;
    }

    // Clamp horizontally
    if (left < 10) left = 10;
    if (left + pw > vw - 10) left = vw - pw - 10;

    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
  }
})();
