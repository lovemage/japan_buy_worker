// ── Persistent music player with synced lyrics ──
// Survives page navigation via sessionStorage state persistence

(function() {
  var STORAGE_KEY = "vovosnap_music";
  var SONG_URL = "/song/%E4%B8%80%E9%A0%93%E7%87%92%E8%82%89%E7%9A%84%E8%B7%9D%E9%9B%A2.mp3";

  var lyrics = [
    { t: 0, text: "\u266a \u4e00\u9813\u71d2\u8089\u7684\u8ddd\u96e2 \u266a" },
    { t: 14, text: "\u7b2c\u4e00\u6b21\u5728\u6211\u62cd\u5617\u8a66\u9019\u5c0f\u751f\u610f" },
    { t: 18, text: "\u4f60\u4e0d\u76f8\u4fe1\uff0c\u4ee3\u8cfc\u771f\u7684\u6bd4\u4f60\u60f3\u5f97\u66f4\u7701\u529b" },
    { t: 22, text: "\u4e0d\u7528\u5929\u5929\u80cc\u58d3\u529b\uff0c\u4e5f\u4e0d\u7528\u56e4\u8ca8\uff0c\u4e0d\u7528\u5b78\u96fb\u5546" },
    { t: 26, text: "\u9019\u662f\u5168\u65b0\u7684\u751f\u6d3b" },
    { t: 30, text: "\u5c31\u50cf\u5e6b\u670b\u53cb\u570b\u5916\u5e36\u9ede\u597d\u6771\u897f" },
    { t: 33, text: "\u52a0\u4e00\u9ede\u8dd1\u817f\u8cbb\uff0c\u8f15\u9b06\u53c8\u5beb\u610f" },
    { t: 37, text: "\u9019\u6b21\u53bb\u65e5\u672c\u85e5\u599d\u6bcf\u4ef6\u52a0\u4e00\u767e\u4e94" },
    { t: 41, text: "\u7c21\u55ae\u4e00\u55ae\u5165\u5e33\u4e00\u5343\u4e94\uff0c\u771f\u662f\u592a\u9177" },
    { t: 45, text: "\u4e00\u9813\u71d2\u8089\u7684\u8ddd\u96e2\u5c31\u662f\u9019\u9ebc\u7c21\u55ae" },
    { t: 49, text: "\u6211\u62cd\u5728\u624b\u7169\u60f1\u90fd\u8ddf\u4f60\u8aaa\u62dc\u62dc" },
    { t: 53, text: "AI \u5e6b\u4f60\u641e\u5b9a\u6587\u6848\u898f\u683c\u98a8\u683c" },
    { t: 57, text: "\u88fd\u9020\u65e5\u671f\u8a9e\u8a00\u532f\u7387\u90fd\u4e0d\u662f\u9694\u95a1" },
    { t: 61, text: "\u5f9e\u65e5\u672c\u5230\u97d3\u570b\u6cf0\u570b\u8d8a\u5357\uff0c\u5230\u6b50\u6d32\u516b\u500b\u898f\u683c\u8cfa\u9322\u5c31\u662f\u6e9c" },
    { t: 65, text: "\u516b\u500b\u570b\u969b\u898f\u683c\uff0c\u8cfa\u9322\u5c31\u662f\u6e9c" },
    { t: 69, text: "\u6709\u4e00\u5f35\u8a02\u55ae\uff0c\u4e00\u5343\u4e94\u7684\u6536\u5165\u5728\u53e3\u888b" },
    { t: 73, text: "\u6703\u8b93\u6211\u751f\u610f\u8b8a\u8d8a\u4f86\u8d8a\u7cbe\u5f69" },
    { t: 77, text: "\u97d3\u570b\u7684\u532f\u7387\u592a\u8907\u96dc\uff0c\u4e0d\u7528\u7b97" },
    { t: 81, text: "\u8d8a\u5357\u5e63\u7684\u898f\u683c\u7d66 AI\uff0c\u5e6b\u4f60\u8f15\u9b06\u770b\u5b9a\u50f9\u548c\u5716\u7247\u7de8\u8f2f\u793e\u7fa4\u5206\u4eab\u7684\u6587\u6848" },
    { t: 85, text: "\u6240\u6709\u9700\u8981\u7169\u60f1\u7684\u90fd\u5df2\u7d93\u70ba\u4f60\u8fa6" },
    { t: 89, text: "\u5546\u5e97\u5167\u7684\u98a8\u683c\uff0c\u88fd\u9020\u65e5\u671f\u548c\u8a9e\u8a00" },
    { t: 93, text: "\u6211\u62cd\u7684 AI \u8b93\u4e00\u5207\u90fd\u5728\u5f48\u6307\u9593" },
    { t: 97, text: "\u81fa\u7063\u65e5\u672c\u97d3\u570b\u6cf0\u570b\u9084\u6709\u7f8e\u570b" },
    { t: 101, text: "\u516b\u5927\u6587\u5316\u898f\u683c\u8d70\u5230\u54ea\u88e1\u90fd\u597d\u505a" },
    { t: 104, text: "\u6211\u62cd\u7169\u60f1\u90fd\u8d70\u958b" },
    { t: 109, text: "\u8d70\u5728\u8def\u4e0a\uff0c\u8a02\u55ae\u4e5f\u9032\u4f86" },
    { t: 115, text: "\u5403\u8457\u71d2\u8089\u7b11\u5bb9\u9019\u9ebc\u751c" },
    { t: 118, text: "\u4ee3\u8cfc\u751f\u6d3b\uff0c\u6bcf\u5929\u50cf\u5728\u904e\u65b0\u5e74" },
    { t: 122, text: "\u4e00\u9813\u71d2\u8089\u7684\u8ddd\u96e2\u5c31\u662f\u9019\u9ebc\u7c21\u55ae\uff0c\u6211\u62cd" },
    { t: 125, text: "\u5728\u624b\u7169\u60f1\u8ddf\u4f60\u8aaa\u62dc\u62dc" },
    { t: 129, text: "AI \u5e6b\u4f60\u641e\u5b9a\u6587\u6848\uff0c\u898f\u683c\u98a8\u683c\u88fd\u9020\u65e5\u671f" },
    { t: 133, text: "\u8a9e\u8a00\u532f\u7387\u90fd\u4e0d\u662f\u9694\u95a1" },
    { t: 137, text: "\u5f9e\u65e5\u672c\u5230\u97d3\u570b\u6cf0\u570b\u8d8a\u5357\uff0c\u5230\u6b50\u6d32\u516b\u500b\u898f\u683c" },
    { t: 141, text: "\u8cfa\u9322\u4e5f\u8cfa\u9322\uff0c\u5c31\u662f\u6e9c" },
    { t: 145, text: "\u6bcf\u4e00\u5f35\u8a02\u55ae\uff0c\u4e00\u5343\u4e94\u7684\u6536\u5165\u5728\u53e3\u888b" },
    { t: 149, text: "\u6211\u62cd\uff0c\u8b93\u6211\u7684\u751f\u610f\u8d8a\u4f86\u8d8a\u7cbe\u5f69 \u266a" }
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
