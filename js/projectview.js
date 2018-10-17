let data = {};
let userData;
let options;
let odata;
let allrepodata;

let issues = { open: [], closed: [] };
let velocityData = [];
let sprintData = [];
let valueLabels = {};
let labels = {};
let repocolorScale = d3.scaleOrdinal(d3.schemeCategory10);
function _query(query) {
  return new Promise((resolve, reject) => {
    $.ajax({
      type: 'GET',
      url: "https://samserrels.com/projectview/get.php",
      dataType: "json",
      async: true,
      crossDomain: true,
      data: query
    })
      .fail((e) => { reject([e, query]) })
      .done(resolve);
  });
}

function getRepoData(username, repos) {
  let proms = [];
  repos.forEach((r) => {
    proms.push(_query({ repo: r.repo, user: username }));
  });

  return Promise.all(proms).then((repodatas) => {
    console.log("repodatas", repodatas);
    allrepodata = repodatas;
    return repodatas;
  });

  //return _query({ repo: repos[0], user: username });
}
function getUserData(username) {
  return _query({ userinfo: username });
}

$(document).ready(function () {
  const rawOptions = Cookies.get('ProjectViewUserData');
  if (rawOptions !== undefined) { options = JSON.parse(); }
  if (options === undefined || !options.user) {
    options = {};
    options.user = "dooglz";
    options.repos = [{ repo: "gpuvis_server", projects: ["GPUVIS_Server"] }, { repo: "gpuvis", projects: ["gpuvis"] }];
    Cookies.set('ProjectViewUserData', options);
    console.info("Default options Set ", options);
  } else {
    console.info("Options loaded from Cookies ", options);
  }
  let er = e => { return ec => { console.error("promise err", e, ec); throw (ec); } };
  console.log("Page Ready!");
  getUserData(options.user)
    .then((d) => { return GraphToObj(d); }, er("getUserData"))
    .then((d) => { userData = d.data; return getRepoData(options.user, options.repos); }, er("GraphToObj"))
    .then((d) => { odata = d; return Promise.all(odata.map(x => GraphToObj(x.data.repository))); }, er("getRepoData"))
    .then((d) => { data.repos = d; data.repository = MergeRepos(d); build() }, er("GraphToObj"));
});

function build() {
  console.log("Building!");
  processLabels();
  RepoList();
  headder();
  canban();
  velocity();
  commitLog();
  milestones();
  window.addEventListener("resize", VelocityGraph);
  $("#reposelect").click(() => { $("#largeModal").modal('show') });
}

function GraphToObj(gql) {
  let obj = {};
  obj.objstore = {};
  return new Promise((resolve, reject, ) => {
    let recurse = (e, p, name, o, op, depth, depthstr) => {
      depthstr += name + "_";
      depth++;
      if (depth > 10) { return; }
      let isArr = Array.isArray(e);
      let isval = !isArr && (typeof (e) !== "object" || ((e === null) || $.isEmptyObject(e)));
      let isEdgeArray = ((e !== null) && Object.keys(e).length === 1 && Object.keys(e)[0] === "edges");
      let isNodeEdge = ((e !== null) && Object.keys(e).length === 1 && Object.keys(e)[0] === "node");
      // console.log(depth, depthstr, name, isArr, isval, isEdgeArray, isNodeEdge);
      if (isEdgeArray) {
        let edges = e.edges;
        op[name] = edges;
        o = op[name];
        e = edges;
      }
      if (isNodeEdge) {
        let node = e.node;
        op[name] = node;
        o = op[name];
        e = node;
      };
      if (!isEdgeArray && !isNodeEdge && !isArr && isval) {
        op[name] = e;
        o = op[name];
      }
      if (!isArr && !isval) {
        if (e.id) {
          //leaf object
          if (obj.objstore[e.id]) {
            obj.objstore[e.id] = { ...obj.objstore[e.id], ...e };
          } else {
            obj.objstore[e.id] = e;
          }
          op[name] = obj.objstore[e.id];
          e = obj.objstore[e.id];
          o = op[name];
        }
        for (child in e) {
          if (o[child] == undefined) { o[child] = {}; }
          recurse(e[child], e, child, o[child], o, depth, depthstr);
        }
      } else if (isArr && !isval && !isEdgeArray && isNodeEdge) {
        console.warn("bop", e);
      }
    };
    recurse(gql, {}, "", obj, {}, 0, "");
    console.info("Converted to Native OBJ");
    resolve(obj);
  });
}


function MergeRepos(repos) {
  let obj = {};
  let keys = ["issues", "milestones", "labels", "projects"];
  for (k of keys) {
    obj[k] = [];
    for (repo of repos) {
      for (ro of repo[k]) {
        //Check for id collisions.
        if (obj[k].find((e) => { return e.id === ro.id })) {
          console.warn("ID collision", ro);
        }
        ro.origin_repo = repo;

        obj[k].push(ro);
      }
    }
  }

  obj.projects.forEach((v, i) => { v.idx = i; });
  return obj;
}

function isEnabledProject(repo, project) {
  return (options.repos.find((e) => {
    return e.repo.toLowerCase() == repo.toLowerCase()
      && e.projects.find(p => p.toLowerCase() == project.toLowerCase())
  }));
}

function RepoList() {

  let pchk = (d) => {
    return $(' \
    <div class="checkbox"> \
    <label for="pck1_'+ d + '" class="form-check-label "> \
      <input type="checkbox" id="pck1_'+ d + '" name="pck1_' + d + '" value="option1" class="form-check-input">' + d + '\
    </label></div>');
  };

  let div = $("#repoModalBody");
  let projectCheckBoxes = $("#projectCheckBoxes");
  let repoCheckBoxes = $("#repoCheckBoxes");
  projectCheckBoxes.empty();
  repoCheckBoxes.empty();
  let enabledprojects = $("<div/>");

  for (repo of data.repos) {
    for (proj of repo.projects) {
      let c = pchk(repo.name + " - " + proj.name);

      if (isEnabledProject(repo.name, proj.name)) {
        c.find("input").prop("checked", true);
        enabledprojects.append('<div class="project_' + proj.idx + '"><div class="block"/>' + repo.name + ':' + proj.name + '</div>');
      }

      projectCheckBoxes.append(c);
    }
  }
  userData.repositoryOwner.repositories.sort((a, b) => { return new Date(b.updatedAt) - new Date(a.updatedAt) })
  for (repo of userData.repositoryOwner.repositories) {
    let c = pchk(repo.name)
    if (options.repos.find((e) => { return e.repo.toLowerCase() == repo.name.toLowerCase() })) {
      c.find("input").prop("checked", true);
    }
    repoCheckBoxes.append(c);
  }

  $("#headder-middle").append("Visible Projects").append(enabledprojects);

}

function headder() {
  $("#username").text("Dooglz");
  $("#user_image").prop("alt", "Dooglz");
  $("#user_image").prop("src", userData.repositoryOwner.avatarUrl);
}

function processLabels() {
  //define label classes
  for (lb of data.repository.labels) {
    if (lb.color == "eeefff") {
      valueLabels[lb.name] = parseInt(lb.name);
    } else {
      if (labels[lb.name] !== undefined) {
        continue;
      }
      let rgb = hexToRgb('#' + lb.color);
      let txtcolour = "#fff";
      if (((rgb.r + rgb.g + rgb.b) / 3) > 128) {
        txtcolour = "#000";
      }
      labels[lb.name] = [lb.color, txtcolour];
      var styleTag = $('<style>.label_' + lb.name + ' { background-color:#' + lb.color + ';color:' + txtcolour + '; }</style>');
      $('html > head').append(styleTag);
    }
  }
}

function velocity() {
  velocityData = [];
  for (e of data.repository.issues) {
    if (e.closedAt && e.closedAt != null && !$.isEmptyObject(e.closedAt)) {
      issues.closed.push(e);
    } else {
      issues.open.push(e);
    }
  }
  for (issue of issues.closed) {
    let issuevalue = 0;
    for (label of issue.labels) {
      if (valueLabels[label.name] != undefined) {
        issuevalue += parseInt(label.name);
      }
    }
    if (true || issuevalue > 0) {
      let date = new Date(issue.closedAt)
      if (!isFinite(date)) {
        console.error("Invalid date", date);
      }
      velocityData.push({ value: issuevalue, date: date });
    }
  }
  velocityData.sort((a, b) => { return (new Date(a.date) - new Date(b.date)) });
  //MANGLE!
  const milisInAWeek = 604800000;
  let sprintTime = milisInAWeek;
  let startpoint = velocityData[0];

  // sprintData[0] = { date: startpoint.date, value: 0 };

  let dataEntry = { date: startpoint.date, value: 0, count: 0, };
  for (let i = 0; i < velocityData.length; i++) {
    const vd = velocityData[i];
    const timegap = (vd.date - dataEntry.date);
    if (timegap <= sprintTime) {
      dataEntry.value += vd.value;
      dataEntry.count++;
    } else {
      //insert old
      sprintData.push(dataEntry);
      //seek new start time
      let newStartPoint = new Date(dataEntry.date.getTime() + sprintTime);
      while (vd.date - newStartPoint > sprintTime) {
        dataEntry = { date: newStartPoint, value: 0 };
        sprintData.push(dataEntry);
        newStartPoint = new Date(dataEntry.date.getTime() + sprintTime);
      }
      dataEntry = { date: newStartPoint, value: 0, count: 0 };
      dataEntry.value += vd.value;
      dataEntry.count++;
    }
  }
  sprintData.push(dataEntry);

  VelocityGraph();
}

function canban() {
  let makeCard = (card, proj) => {
    let id = card.id;
    let tmp = $('<div class="projectcard project_' + proj.idx + '"></div>');
    let it = $('<div class="projectcard_issue float-left"></div>');
    let vt = $('<div class="projectcard_issue_value float-right badge badge-info ">12</div>');
    let valueScore = 0;

    let assosiated_issues = data.repository.issues.filter((i) => {
      for (c of i.projectCards) {
        if (c.id == id) {
          return true;
        }
      }
      return false;
    });
    //it.text(id);
    if (card.note && card.note != "null" && !$.isEmptyObject(card.note)) { it.append(card.note + "<br>"); }
    if (assosiated_issues) {
      for (ai of assosiated_issues) {
        let iit = $('<div class="projectcard_issue_text"/>');
        iit.append("" + ai.title);
        it.append(iit);
        for (lb of ai.labels) {
          if (valueLabels[lb.name] != undefined) {
            valueScore += parseInt(lb.name);
          } else {
            it.append($('<div class="projectcard_issue_label badge label_' + lb.name + '">' + lb.name + '<div>'));
          }
        }

      }
    }
    vt.text(valueScore);
    tmp.append($('<div class="projectmarker"/>'));
    tmp.append(it);
    tmp.append(vt);
    return { element: tmp, value: valueScore };
  };

  //hardcoded 3 columns for now
  for (let colID = 0; colID < 3; colID++) {
    let div = $("#card-body-" + colID);
    let valueScore = 0;
    let cardcount = 0;
    div.empty();
    for (proj of data.repository.projects) {
      if (isEnabledProject(proj.origin_repo.name, proj.name) && proj.columns[colID]) {
        for (card of proj.columns[colID].cards) {
          cardcount++;
          let carddiv = makeCard(card, proj);
          valueScore += carddiv.value;
          div.append(carddiv.element);
        }
      }
    }
    $("#card-count-" + colID).html(cardcount);
    $("#total-value-" + colID).html(valueScore);
  }
}

function commitLog() {

}

function milestones() {
  let div = $("#milestone_container");
  div.empty();
  for (ms of data.repository.milestones) {
    let assosiated_issues = data.repository.issues.filter((i) => {
      return (i.milestone && i.milestone.id == ms.id)
    });
    let open = 0;
    let closed = 0;
    for (issue of assosiated_issues) {
      if (issues.open.includes(issue)) {
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
    msd.find(".au-progress__title").text(ms.title);
    msd.find(".fud").text(percent + "% complete, " + open + ' open, ' + closed + ' closed');
    div.append(msd);
  }
}

let ChartData;
let mySlider;
function VelocityGraph() {

  ChartData = sprintData.slice(0);
  let labels = [];
  let datapoints = [];
  let datapoints2 = [];
  for (dp of ChartData) {
    datapoints.push(dp.value);
    labels.push(dp.date.toLocaleDateString());
    datapoints2.push(dp.count);
  }

  mySlider = $("#velslider").slider({});



  randomScalingFactor = function () {
    return Math.round(Math.random() * 200 - 100);
  };

  var barChartData = {
    labels: labels,
    datasets: [{
      label: 'Completed Card Value',
      borderColor: "rgba(0, 123, 255, 0.9)",
      borderWidth: "0",
      backgroundColor: "rgba(0, 123, 255, 0.5)",
      fontFamily: "Poppins",
      yAxisID: 'y-axis-1',
      data: datapoints
    }, {
      label: 'Completed Cards',
      borderColor: "rgba(0,0,0,0.09)",
      borderWidth: "0",
      backgroundColor: "rgba(0,0,0,0.07)",
      fontFamily: "Poppins",
      yAxisID: 'y-axis-1',
      data: datapoints2
    }]

  };

  var ctx = $("#velocityGraphCanvas");
  new Chart(ctx, {
    type: 'bar',
    data: barChartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      tooltips: {
        mode: 'index',
        intersect: true
      },
      scales: {
        yAxes: [{
          type: 'linear',
          display: true,
          position: 'left',
          id: 'y-axis-1',
        }],
      }
    }
  });
};

function VelocityGraph2() {
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