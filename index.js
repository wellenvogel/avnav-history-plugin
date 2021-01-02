console.log("history main loaded");
(function(){
    let COLORMAP=["#000000", "#FFFF00", "#1CE6FF", "#FF34FF",
        "#FF4A46", "#008941", "#006FA6", "#A30059",
        "#FFDBE5", "#7a4900", "#0000A6", "#63FFAC",
        "#B79762", "#004D43", "#8FB0FF", "#997D87",
        "#5A0007", "#809693", "#FEFFE6", "#1B4400",
        "#4FC601", "#3B5DFF", "#4A3B53", "#FF2F80",
        "#61615A", "#BA0900", "#6B7900", "#00C2A0",
        "#FFAA92", "#FF90C9", "#B903AA", "#D16100",
        "#DDEFFF", "#000035", "#7B4F4B", "#A1C299",
        "#300018", "#0AA6D8", "#013349", "#00846F",
        "#372101", "#FFB500", "#C2FFED", "#A079BF",
        "#CC0744", "#C0B9B2", "#C2FF99", "#001E09",
        "#00489C", "#6F0062", "#0CBD66", "#EEC3FF",
        "#456D75", "#B77B68", "#7A87A1", "#788D66",
        "#885578", "#FAD09F", "#FF8A9A", "#D157A0",
        "#BEC459", "#456648", "#0086ED", "#886F4C",
        "#34362D", "#B4A8BD", "#00A6AA", "#452C2C",
        "#636375", "#A3C8C9", "#FF913F", "#938A81",
        "#575329", "#00FECF", "#B05B6F", "#8CD0FF",
        "#3B9700", "#04F757", "#C8A1A1", "#1E6E00",
        "#7900D7", "#A77500", "#6367A9", "#A05837",
        "#6B002C", "#772600", "#D790FF", "#9B9700",
        "#549E79", "#FFF69F", "#201625", "#72418F",
        "#BC23FF", "#99ADC0", "#3A2465", "#922329",
        "#5B4534", "#FDE8DC", "#404E55", "#0089A3",
        "#CB7E98", "#A4E804", "#324E72", "#6A3A4C"];
    function nextColor(current){
        let r=parseInt(current.substr(1,2),16);
        let g=parseInt(current.substr(3,2),16);
        let b=parseInt(current.substr(5,2),16);
        r=parseInt(256*Math.random()+r)%256;
        g=parseInt(256*Math.random()+g)%256;
        b=parseInt(256*Math.random()+b)%256;
        return '#'+r.toString(16)+g.toString(16)+b.toString(16);
    }

    function removeChart(){
        let chart=document.getElementById('chart');
        chart.innerHTML="";
    }
    function filter(data,index){
        let rt=[];
        data.forEach(function(row){
            let or=[row[0]];
            if (row[index] !== null && row[index] !== undefined){
                or.push(row[index])
                rt.push(or);
            }
        })
        return rt;
    }
    function createChart(serverData,fields){
        let data=serverData.data;
        //we rely on the server having the same order of fields as we have...
        let yaxiswidth=50;
        let margin = {top: 10, right: 30, bottom: 30, left: yaxiswidth};
        let chart=document.getElementById('chart');
        let rect=chart.getBoundingClientRect();
        let width=rect.width-margin.left-margin.right;
        let height=rect.height-margin.top-margin.bottom;
        let svg = d3.select("#chart")
                 .append("svg")
                    .attr("width",rect.width)
                    .attr("height",rect.height)
                 .append("g")
                 .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        //compute the room we need for the y axis
        let addLeft=0;
        fields.forEach(function(field){
            if (field.ownAxis === undefined || field.ownAxis) addLeft+=yaxiswidth;
        })
        if (addLeft >= yaxiswidth) addLeft-=yaxiswidth;
        let x=d3.scaleTime()
                .domain(d3.extent(data,function(d){return d[0]*1000}))
                .range([addLeft,width]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x)
                .tickFormat(d3.timeFormat("%d/%Hh"))
            );
        let currentY;
        let leftMargin=0;
        for (let idx=0;idx<fields.length;idx++) {
            //new y axis?
            let field=fields[idx];
            if (currentY === undefined || (field.ownAxis === undefined || field.ownAxis)) {
                currentY = d3.scaleLinear()
                    .domain([0, d3.max(data, function (d) {
                        return d[idx+1]
                    })]).nice()
                    .range([height, 0]);
                svg.append("g")
                    .attr("transform","translate("+leftMargin+",0)")
                    .attr("stroke", field.color)
                    .call(d3.axisLeft(currentY));
                leftMargin+=50;
            }
            svg.append("path")
                .datum(data)
                .attr("fill", "none")
                .attr("stroke", field.color)
                .attr("stroke-width", 1.5)
                .attr("d", d3.line()
                    .defined(function(d){return !isNaN(d[idx+1]) && d[idx+1] !== null})
                    .x(function (d) {
                        return x(d[0] * 1000)
                    })
                    .y(function (d) {
                        return currentY(d[idx+1])
                    })
                )
        }

    }
    function fillChart(){
        let hours=document.querySelector('input[name="hour"]:checked').value;
        let fieldCb=document.querySelectorAll('.fieldSelector input[type=checkbox]');
        let fields=[];
        for (let i=0;i<fieldCb.length;i++){
            if (fieldCb[i].checked){
                let ce=fieldCb[i].parentElement.querySelector('input[type=color]');
                fields.push(
                    {
                        name: fieldCb[i].getAttribute('data-value'),
                        color: ce ? ce.value : '#000000'
                    }
                );
            }
        }
        if (fields.length < 1){
            removeChart();
            return;
        }
        let now=new Date();
        let start=now.getTime()/1000 - hours*3600;
        let url="api/history?fromTime="+encodeURIComponent(start+"")+"&fields=";
        fields.forEach(function(field){url+=","+encodeURIComponent(field.name)});
        fetch(url)
        .then(function(resp){return resp.json()})
        .then(function(data){
            removeChart();
            createChart(data,fields);
        })
        .catch(function(error){alert(error)});
    }

    function createFieldSelector(value,color,className){
        let fe=document.createElement('div');
        fe.classList.add(className)
        let cb=document.createElement('input');
        cb.setAttribute('type','color');
        cb.setAttribute('value',color);
        cb.classList.add('colorSelect');
        fe.appendChild(cb);
        cb=document.createElement('input');
        cb.setAttribute('type','checkbox');
        cb.setAttribute('data-value',value);
        fe.appendChild(cb);
        let lb=document.createElement('span');
        lb.classList.add('label');
        lb.textContent=value;
        fe.appendChild(lb);
        return fe;
    }
    function createRadio(name,label,value,className){
        let i=document.createElement('input');
        i.setAttribute('type','radio');
        i.value=value;
        i.setAttribute('name',name);
        let l=document.createElement('label');
        l.textContent=label;
        l.appendChild(i);
        return l;
    }

    window.addEventListener('load',function(){
        this.fetch('api/status')
            .then(function(resp){return resp.json()})
            .then(function(data){
                let hours=data.storeTime;
                let selectHours=[Math.ceil(hours),Math.ceil(hours*2/3),Math.ceil(hours/3)];
                let hsParent=document.getElementById('hourSelect');
                for (let i=0;i<selectHours.length;i++){
                    let hs=createRadio('hour',selectHours[i]+"h",selectHours[i],"hourSelector");
                    hsParent.appendChild(hs);
                }
                document.querySelector('input[name="hour"]:first-of-type').checked=true;
                let b=document.getElementById('start')
                if (b){
                    b.addEventListener('click',function(){
                        fillChart();
                    })
                }
                let colorIndex=4;
                if (data.fields){
                    let selectorList=document.getElementById('selectors');
                    for (let i=0;i<data.fields.length;i++){
                        let fs=createFieldSelector(data.fields[i],COLORMAP[colorIndex],"fieldSelector")
                        colorIndex+=1;
                        if (colorIndex >= COLORMAP.length) colorIndex=0;
                        selectorList.appendChild(fs);
                    }
                }
            })
            .catch(function(error){alert(error);})
        window.addEventListener('resize',function(){
            window.setTimeout(fillChart,100);
        })
    });
})();


