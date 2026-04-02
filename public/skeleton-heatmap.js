/* global document */
// Populate heatmap skeleton cells (abstract hint row)
(function () {
  var g = document.getElementById("skel-heatmap");
  if (!g) return;
  for (var i = 0; i < 30; i++) {
    var c = document.createElement("div");
    c.className = "skel-heat-cell";
    g.appendChild(c);
  }
})();
