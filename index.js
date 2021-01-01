console.log("history main loaded");
(function(){
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
    function createChart(data){
        data=data.data;
        let margin = {top: 10, right: 30, bottom: 30, left: 60};
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

        let fData=filter(data,1);         
        let x=d3.scaleTime()
                .domain(d3.extent(data,function(d){return d[0]*1000}))
                .range([0,width]);
        let y=d3.scaleLinear()
                .domain(d3.extent(fData,function(d){return d[1]}))
                .range([0,height]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x));
        svg.append("g")
            .call(d3.axisLeft(y));
        svg.append("path")
            .datum(fData)
            .attr("fill", "none")
            .attr("stroke", "steelblue")
            .attr("stroke-width", 1.5)
            .attr("d", d3.line()
                .x(function(d) { return x(d[0]*1000) })
                .y(function(d) { return y(d[1]) })
                )                     


    }
    function fillChart(hours){
        let fieldCb=document.querySelectorAll('.fieldSelector input[type=checkbox]');
        let fields=[];
        for (let i=0;i<fieldCb.length;i++){
            if (fieldCb[i].checked){
                fields.push(fieldCb[i].getAttribute('data-value'));
            }
        }
        if (fields.length < 1){
            removeChart();
            return;
        }
        let now=new Date();
        let start=now.getTime()/1000 - hours*3600;
        let url="api/history?fromTime="+encodeURIComponent(start+"")+"&fields=";
        fields.forEach(function(field){url+=","+encodeURIComponent(field)});
        fetch(url)
        .then(function(resp){return resp.json()})
        .then(function(data){
            removeChart();
            createChart(data);
        })
        .catch(function(error){alert(error)});
    }

    function createFieldSelector(idx,name){
        let fe=document.createElement('div');
        fe.classList.add('fieldSelector')
        let cb=document.createElement('input');
        cb.setAttribute('type','checkbox');
        cb.setAttribute('data-value',name);
        fe.appendChild(cb);
        let label=document.createElement('span');
        label.classList.add('label');
        label.textContent=name;
        fe.appendChild(label);
        return fe;
    }

    window.addEventListener('load',function(){
        this.fetch('api/status')
            .then(function(resp){return resp.json()})
            .then(function(data){
                let hours=data.storeTime;
                let buttonHours=[Math.ceil(hours),Math.ceil(hours*2/3),Math.ceil(hours/3)];
                for (let i=0;i<buttonHours.length;i++){
                    let b=document.getElementById('time'+(i+1))
                    if (b){
                        b.textContent=buttonHours[i];
                        b.setAttribute('data-value',buttonHours[i]);
                        b.addEventListener('click',function(){
                            fillChart(buttonHours[i]);
                        })
                    }
                }
                if (data.fields){
                    let selectorList=document.getElementById('selectors');
                    for (let i=0;i<data.fields.length;i++){
                        let fs=createFieldSelector(i,data.fields[i])
                        selectorList.appendChild(fs);
                    }
                }
            })
            .catch(function(error){alert(error);})
    });
})();


