let data = {};
let userData;
let options;
let odata;
let allrepodata;
function _query(query) {
  return new Promise((resolve, reject) => {
    $.ajax({
      type: 'GET',
      url: "http://samserrels.com/projectview/get.php",
      dataType: "json",
      async: true,
      crossDomain: true,
      data: query
    })
      .fail(reject)
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
  options = Cookies.get('ProjectViewUserData');
  if (options === undefined) {
    options = {};
    options.user = "dooglz";
    options.repos = [{ repo: "gpuvis_server", projects: ["GPUVIS_Server"] }, { repo: "gpuvis", projects: ["gpuvis"] }];
    Cookies.set('ProjectViewUserData', options);
    console.info("Default options Set ", options);
  } else {
    console.info("Options loaded from Cookies ", options);
  }

  console.log("Page Ready!");
  getUserData(options.user)
    .then((d) => { return GraphToObj(d); })
    .then((d) => { userData = d.data; return getRepoData(options.user, options.repos); })
    .then((d) => { odata = d; return Promise.all(odata.map(x => GraphToObj(x.data.repository))); })
    .then((d) => { data.repos = d; data.repository = MergeRepos(d); build() });
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

let issues = { open: [], closed: [] };
let velocityData = [];
let valueLabels = {};

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
        if(obj[k].find((e)=>{return e.id === ro.id})){
          console.warn("ID collision", ro);
        }
        obj[k].push(ro);
      }
    }
  }
  return obj;
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

  for (repo of data.repos) {
    for (proj of repo.projects) {
      let c = pchk(repo.name + " - " + proj.name);

      if (options.repos.find((e) => { return e.repo.toLowerCase() == repo.name.toLowerCase() && e.projects.includes(proj.name) })) {
        c.find("input").prop("checked", true);
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
      let rgb = hexToRgb('#' + lb.color);
      let txtcolour = "#fff";
      if (((rgb.r + rgb.g + rgb.b) / 3) > 128) {
        txtcolour = "#000";
      }
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
    if (issuevalue > 0) {
      let date = new Date(issue.closedAt)
      if (!isFinite(date)) {
        console.error("Invalid date", date);
      }
      velocityData.push({ value: issuevalue, date: date });
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
    tmp.append(it);
    tmp.append(vt);
    return { element: tmp, value: valueScore };
  };

  let i = 0;
  for (col of data.repository.projects[0].columns) {
    let div = $("#card-body-" + i);
    let valueScore = 0;
    $("#card-count-" + i).html(col.cards.length);
    div.empty();
    for (cardref of col.cards) {
      let card = makeCard(cardref);
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