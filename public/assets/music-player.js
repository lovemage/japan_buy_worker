// ── Persistent music player with synced lyrics ──
// Survives page navigation via sessionStorage state persistence

(function() {
  var STORAGE_KEY = "vovosnap_music";
  var SONG_URL = "/song/%E4%B8%80%E9%A0%93%E7%87%92%E8%82%89%E7%9A%84%E8%B7%9D%E9%9B%A2.mp3";

  var lyrics = [
    { t: 0, text: "♪ 一頓燒肉的距離 ♪" },
    { t: 14, text: "第一次在我拍嘗試這小生意" },
    { t: 18, text: "你不相信，代購真的比你想得更省力" },
    { t: 22, text: "不用天天背壓力，也不用囤貨，不用學電商" },
    { t: 26, text: "這是全新的生活" },
    { t: 30, text: "就像幫朋友國外帶點好東西" },
    { t: 33, text: "加一點跑腿費，輕鬆又寫意" },
    { t: 37, text: "這次去日本藥妝每件加一百五" },
    { t: 41, text: "簡單一單入帳一千五，真是太酷" },
    { t: 45, text: "一頓燒肉的距離就是這麼簡單" },
    { t: 49, text: "我拍在手煩惱都跟你說掰掰" },
    { t: 53, text: "AI 幫你搞定文案規格風格" },
    { t: 57, text: "製造日期語言匯率都不是隔閡" },
    { t: 61, text: "從日本到韓國泰國越南，到歐洲八個規格賺錢就是溜" },
    { t: 65, text: "八個國際規格，賺錢就是溜" },
    { t: 69, text: "有一張訂單，一千五的收入在口袋" },
    { t: 73, text: "會讓我生意變越來越精彩" },
    { t: 77, text: "韓國的匯率太複雜，不用算" },
    { t: 81, text: "越南幣的規格給 AI，幫你輕鬆看定價和圖片編輯社群分享的文案" },
    { t: 85, text: "所有需要煩惱的都已經為你辦" },
    { t: 89, text: "商店內的風格，製造日期和語言" },
    { t: 93, text: "我拍的 AI 讓一切都在彈指間" },
    { t: 97, text: "臺灣日本韓國泰國還有美國" },
    { t: 101, text: "八大文化規格走到哪裡都好做" },
    { t: 104, text: "我拍煩惱都走開" },
    { t: 109, text: "走在路上，訂單也進來" },
    { t: 115, text: "吃著燒肉笑容這麼甜" },
    { t: 118, text: "代購生活，每天像在過新年" },
    { t: 122, text: "一頓燒肉的距離就是這麼簡單，我拍" },
    { t: 125, text: "在手煩惱跟你說掰掰" },
    { t: 129, text: "AI 幫你搞定文案，規格風格製造日期" },
    { t: 133, text: "語言匯率都不是隔閡" },
    { t: 137, text: "從日本到韓國泰國越南，到歐洲八個規格" },
    { t: 141, text: "賺錢也賺錢，就是溜" },
    { t: 145, text: "每一張訂單，一千五的收入在口袋" },
    { t: 149, text: "我拍，讓我的生意越來越精彩 ♪" }
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
    if (btn) btn.style.opacity = playing ? "1" : "0.7";
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
