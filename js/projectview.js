let data = {};
$(document).ready(function () {
  console.log("ready!");
  $.ajax({
    type: 'GET',
    url: "http://samserrels.com/projectview/get.php",
    dataType: "json",
    async: false, // this is by default false, so not need to mention
    crossDomain: true, // tell the browser to allow cross domain calls.
    data: { repo: "gpuvis_server", user: "dooglz" }
  })
    .fail(function () {
      console.log("error");
    })
    .done((d) => {
      console.log("success", d);
      data = d.data;
      processLabels();
      canban();
      velocity();
      commitLog();
      milestones();

      window.addEventListener("resize", VelocityGraph);
    });
});

let issues = { open: [], closed: [] };
let velocityData = [];
let valueLabels = {};
let objstore = {};
function GraphToObj(gql) {

  let recurse = (e, p, name, depth) => {
    depth++;
    if (depth > 10) { return; }
    let isArr = Array.isArray(e);
    let isval = !isArr && (typeof (e) !== "object" || (e === null));
    let isEdgeArray = ((e !== null) && Object.keys(e).length === 1 && Object.keys(e)[0] === "edges");
    let isNodeEdge = ((e !== null) && Object.keys(e).length === 1 && Object.keys(e)[0] === "node");
    if (isEdgeArray) {
      let edges = e.edges;
      p[name] = edges;
      e = edges;
    }
    if (isNodeEdge) {
      let node = e.node;
      p[name] = node;
      e = node;
    };
    if (!isArr && !isval) {
      if (e.id) {
        //leaf object
        if (objstore[e.id]) {
          objstore[e.id] = { ...objstore[e.id], ...e };
        } else {
          objstore[e.id] = e;
        }
        p[name] = objstore[e.id];
        e = objstore[e.id];
      }
      for (child in e) {
        recurse(e[child], e, child, depth);
      }
    } else if (isArr && !isval) {
      console.warn("bop", e);
    }
  };
  recurse(gql, {}, "", 0);
  return gql;
}


function processLabels() {
  //define label classes
  for (lb of data.repository.labels.edges) {
    if (lb.node.color == "eeefff") {
      valueLabels[lb.node.name] = parseInt(lb.node.name);
    } else {
      let rgb = hexToRgb('#' + lb.node.color);
      let txtcolour = "#fff";
      if (((rgb.r + rgb.g + rgb.b) / 3) > 128) {
        txtcolour = "#000";
      }
      var styleTag = $('<style>.label_' + lb.node.name + ' { background-color:#' + lb.node.color + ';color:' + txtcolour + '; }</style>');
      $('html > head').append(styleTag);
    }
  }
}

function velocity() {
  velocityData = [];
  for (e of data.repository.issues.edges) {
    if (e.node.closedAt && e.node.closedAt != null) {
      issues.closed.push(e.node);
    } else {
      issues.open.push(e.node);
    }
  }
  for (issue of issues.closed) {
    let issuevalue = 0;
    for (labelref of issue.labels.edges) {
      let label_id = labelref.node.id;
      let label = data.repository.labels.edges.find((l) => {
        return l.node.id == label_id;
      });
      if (valueLabels[label.node.name] != undefined) {
        issuevalue += parseInt(label.node.name);
      }
    }
    if (issuevalue > 0) {
      velocityData.push({ value: issuevalue, date: new Date(issue.closedAt) });
    }
  }
  velocityData.sort((a, b) => { return (new Date(a.date) - new Date(b.date)) });
  VelocityGraph();
}

function canban() {
  let makeCard = (card) => {
    let id = card.id;
    let tmp = $('<div class="projectcard"></div>');
    let it = $('<div class="projectcard_issue float-left"></div>');
    let vt = $('<div class="projectcard_issue_value float-right badge badge-info ">12</div>');
    let valueScore = 0;

    let assosiated_issues = data.repository.issues.edges.filter((i) => {
      for (c of i.node.projectCards.edges) {
        if (c.node.id == id) {
          return true;
        }
      }
      return false;
    });
    //it.text(id);
    if (card.note && card.note != "null") { it.append(card.note + "<br>"); }
    if (assosiated_issues) {
      for (ai of assosiated_issues) {
        let iit = $('<div class="projectcard_issue_text"/>');
        iit.append(ai.node.title);
        let labels = [];
        for (lb of ai.node.labels.edges) {
          let lid = lb.node.id;
          labels.push(data.repository.labels.edges.find((l) => {
            return l.node.id == lid;
          }));
        }
        it.append(iit);
        for (lb of labels) {
          if (valueLabels[lb.node.name] != undefined) {
            valueScore += parseInt(lb.node.name);
          } else {
            it.append($('<div class="projectcard_issue_label badge label_' + lb.node.name + '">' + lb.node.name + '<div>'));
          }
        }

      }
    }
    vt.text(valueScore);
    tmp.append(it);
    tmp.append(vt);
    return { element: tmp, value: valueScore };
  };

  let i = 0;
  for (col of data.repository.projects.edges[0].node.columns.edges) {
    let collum = col.node;
    let div = $("#card-body-" + i);
    let valueScore = 0;
    $("#card-count-" + i).html(collum.cards.edges.length);
    div.empty();
    for (cardref of collum.cards.edges) {
      let card = makeCard(cardref.node);
      valueScore += card.value;
      div.append(card.element);
    }
    $("#total-value-" + i).html(valueScore);
    i++;
  }
}

function commitLog() {

}


function milestones() {
  let div = $("#milestone_container");
  div.empty();
  for (ms of data.repository.milestones.edges) {
    let assosiated_issues = data.repository.issues.edges.filter((i) => {
      return (i.node.milestone && i.node.milestone.id == ms.node.id)
    });
    let open = 0;
    let closed = 0;
    console.log(assosiated_issues);
    for (issue of assosiated_issues) {
      if (issues.open.includes(issue.node)) {
        open++;
      } else {
        closed++;
      }
    }
    let percent = Math.floor(100 * (closed / (open + closed)))
    let msd = $('<div class="au-progress">\
  <b><span class="au-progress__title"></span></b><br><span class="au-progress__title fud"></span>\
  <div class="au-progress__bar">\
  <div class="au-progress__inner js-progressbar-simple" role="progressbar" data-transitiongoal="'+ percent + '" aria-valuenow="' + percent + '" style="width: ' + percent + '%;">\
  </div>\
  </div>\
  </div>)');
    msd.find(".au-progress__title").text(ms.node.title);
    msd.find(".fud").text(percent + "% complete, " + open + ' open, ' + closed + ' closed');
    div.append(msd);
  }
}



function VelocityGraph() {
  let data = velocityData.slice(0);
  {
    const dlnow = data.length - 1;
    for (let i = 0; i < dlnow; i++) {
      const timeTilNext = data[i + 1].date - data[i].date;
      const milisInAWeek = 604800000;
      const weeks = timeTilNext / milisInAWeek;
      if (weeks > 1) {
        let new0point = new Date(data[i].date).setDate(data[i].date.getDate() + 7);
        data.push({ value: 0, date: new0point });
        new0point = new Date(data[i + 1].date).setDate(data[i].date.getDate() - 7);
        data.push({ value: 0, date: new0point });
      }
    }
    data.sort((a, b) => { return (new Date(a.date) - new Date(b.date)) });
  }
  console.log("d3data", data);
  const svg = d3.select("#velocityGraph");
  svg.selectAll("*").remove();
  let margin = ({ top: 4, right: 0, bottom: 18, left: 25 });
  let height = svg.node().getBoundingClientRect().height;
  let width = svg.node().getBoundingClientRect().width;

  let x = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([margin.left, width - margin.right]);

  let y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value)]).nice()
    .range([height - margin.bottom, margin.top]);

  let area = d3.area()
    // .curve(d3.curveStepBefore)
    .x(d => x(d.date))
    .y0(y(0))
    .y1(d => y(d.value));

  let xAxis = g => g
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

  let yAxis = g => g
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.select(".domain").remove());

  svg.append("path")
    .datum(data)
    .attr("fill", "#00b5e9")
    // 
    .attr("d", area);

  svg.append("g")
    .call(xAxis);

  svg.append("g")
    .call(yAxis);

}

function hexToRgb(hex) {
  let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function (m, r, g, b) {
    return r + r + g + g + b + b;
  });
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}