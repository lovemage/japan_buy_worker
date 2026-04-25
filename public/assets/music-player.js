// ── Persistent music player with synced lyrics ──
// Survives page navigation via sessionStorage state persistence

(function() {
  var STORAGE_KEY = "vovosnap_music";
  var SONG_URL = "/song/%E4%B8%80%E9%A0%93%E7%87%92%E8%82%89%E7%9A%84%E8%B7%9D%E9%9B%A2.mp3";

  var lyrics = [
    { t: 0, text: "♪ 一頓燒肉的距離 ♪" },
    { t: 14, text: "第一次在我拍嘗試這小生意" },
    { t: 18, text: "你可能不相信，代購真的比你想得更省力" },
    { t: 21, text: "不用天天背壓力，也不用囤貨，不用學電商" },
    { t: 26, text: "這是全新的生活" },
    { t: 30, text: "就像幫朋友國外帶點好東西" },
    { t: 33, text: "加一點跑腿費，輕鬆又寫意" },
    { t: 37, text: "這次去日本藥妝每件加一百五" },
    { t: 41, text: "簡單幾單入帳一千五，真是太酷" },
    { t: 45, text: "一頓燒肉的距離就是這麼簡單" },
    { t: 48, text: "我拍~拍~在手煩惱都跟你說掰掰~AI" },
    { t: 53, text: "幫你搞定文案規格風格" },
    { t: 56, text: "製造日期語言匯率都不是隔閡" },
    { t: 59, text: "從日本到韓國泰國越南，到歐洲八個國家賺錢就是那麼溜" },
    { t: 62, text: "發個文過去也賺錢~就是那麼溜" },
    { t: 67, text: "幾張訂單一千五的收入在口袋 baby all style" },
    { t: 71, text: "讓我的生意變越來越精彩" },
    { t: 75, text: "韓國的匯率太複雜，不用算" },
    { t: 77, text: "越南幣的匯率給 AI幫你輕鬆看~定價和圖片編輯社群分享的文案" },
    { t: 85, text: "所有需要煩惱的都已經為你辦" },
    { t: 88, text: "商店內的風格，製造日期和語言" },
    { t: 91, text: "我拍的 AI 讓一切都在彈指間" },
    { t: 95, text: "臺灣日本韓國泰國還有美國" },
    { t: 99, text: "發個文就~走到哪裡都好做" },
    { t: 104, text: "我拍一拍~煩惱都走開 baby all style" },
    { t: 109, text: "走在路上，訂單也進來 every single day" },
    { t: 115, text: "吃著燒肉笑容這麼甜" },
    { t: 118, text: "代購生活，每天像在過新年" },
    { t: 120, text: "一頓燒肉的距離就是這麼簡單，我拍~拍" },
    { t: 126, text: "在手煩惱跟你說掰掰~AI" },
    { t: 128, text: "幫你搞定文案，規格風格製造日期" },
    { t: 131, text: "語言匯率都不是隔閡" },
    { t: 133, text: "從日本到韓國泰國越南到歐洲" },
    { t: 136, text: "發個文過去也賺錢~就是那麼溜" },
    { t: 139, text: "幾張訂單一千五的收入在口袋~Baby all snap" },
    { t: 146, text: "讓我的生意越來越精彩 ♪" }
  ];

  var audio = null;
  var playing = false;
  var lyricIdx = -1;

  // Restore state from sessionStorage
  function restoreState() {
    try {
      var s = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      if (s && s.playing) {
        initAudio();
        audio.currentTime = s.time || 0;
        audio.play().then(function() {
          playing = true;
          updateUI();
          showBar();
        }).catch(function() {});
      }
    } catch(e) {}
  }

  // Save state before navigation
  function saveState() {
    if (!audio) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      playing: playing,
      time: audio.currentTime
    }));
  }

  function initAudio() {
    if (audio) return;
    audio = new Audio(SONG_URL);
    audio.addEventListener("timeupdate", syncLyric);
    audio.addEventListener("ended", function() {
      playing = false;
      updateUI();
      hideBar();
      sessionStorage.removeItem(STORAGE_KEY);
    });
  }

  function syncLyric() {
    if (!audio) return;
    var t = audio.currentTime;
    var idx = -1;
    for (var i = lyrics.length - 1; i >= 0; i--) {
      if (t >= lyrics[i].t) { idx = i; break; }
    }
    if (idx !== lyricIdx) {
      lyricIdx = idx;
      var el = document.getElementById("lyric-text");
      if (el) {
        el.style.opacity = "0";
        setTimeout(function() {
          el.textContent = idx >= 0 ? lyrics[idx].text : "";
          el.style.opacity = "1";
        }, 150);
      }
    }
  }

  function updateUI() {
    var playIcon = document.getElementById("nav-music-icon-play");
    var pauseIcon = document.getElementById("nav-music-icon-pause");
    var btn = document.getElementById("nav-music-btn");
    if (playIcon) playIcon.style.display = playing ? "none" : "";
    if (pauseIcon) pauseIcon.style.display = playing ? "" : "none";
    if (btn) {
      btn.style.opacity = playing ? "1" : "0.7";
      btn.setAttribute("aria-pressed", playing ? "true" : "false");
      btn.setAttribute("aria-label", playing ? "暫停主題曲" : "播放主題曲");
    }
  }

  function showBar() {
    var bar = document.getElementById("lyric-bar");
    if (bar) bar.style.display = "";
  }

  function hideBar() {
    var bar = document.getElementById("lyric-bar");
    if (bar) bar.style.display = "none";
  }

  // Global toggle function
  window.toggleMusic = function() {
    initAudio();
    if (playing) {
      audio.pause();
      playing = false;
    } else {
      audio.play();
      playing = true;
      showBar();
    }
    updateUI();
    saveState();
  };

  // Save state on navigation
  window.addEventListener("beforeunload", saveState);
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") saveState();
  });

  // Intercept link clicks to save state before navigation
  document.addEventListener("click", function(e) {
    var link = e.target.closest("a[href]");
    if (link && !link.target && link.hostname === location.hostname) {
      saveState();
    }
  });

  // Auto-restore on page load
  restoreState();
})();
