console.log("history diagram loaded");
(function(){
    let NAME="avnav-history-plugin";
    let HistoryChart=function(elementId) {
        let self=this;
        this.tooltip = d3.select("body")
            .append("div")
            .style("position", "absolute")
            .style("z-index", "10")
            .style("visibility", "hidden")
            .text("a simple tooltip");
        this.tooltip.node().classList.add('tooltip');
        this.tooltip.on("click",function(){
            self.tooltip.style("visibility","hidden");
        })
        this.element=elementId;
    }
    HistoryChart.prototype.removeChart=function(){
        let chart=document.getElementById(this.element);
        chart.innerHTML="";
    }
    HistoryChart.prototype.format2=function (v){
        v=parseInt(v);
        return ("0"+v.toFixed(0)).substr(-2);
    }
    HistoryChart.prototype.formatDate=function(dt){
        return dt.getFullYear()+"/"+this.format2(dt.getMonth()+1)+"/"+this.format2(dt.getDate())+" "+
            this.format2(dt.getHours())+":"+this.format2(dt.getMinutes());
    }
    HistoryChart.prototype.addToolTip=function(d3el,xscale,yscale,name){
        let timer=undefined;
        let ttime=8000;
        let self=this;
        function fillTT(ev){
            if (! self.tooltip) return;
            self.tooltip.style("top", (ev.pageY-10)+"px").style("left",(ev.pageX+10)+"px");
            let xy=d3.pointer(ev);
            let dt=xscale.invert(xy[0]);
            let v=yscale.invert(xy[1]);
            self.tooltip.html(escape(name)+"<br/>"+self.formatDate(dt)+"<br/>"+v.toFixed(3));
        }
        function showTT(ev){
            if (! self.tooltip) return;
            self.tooltip.style("visibility", "visible");
            return fillTT(ev);
        }
        function hideTT(){
            if (! self.tooltip) return;
            return self.tooltip.style("visibility", "hidden");
        }
        d3el.on("pointerenter", function(ev){
            showTT(ev);
            window.clearTimeout(timer);
            timer=window.setTimeout(hideTT,ttime);
        });
        d3el.on("pointermove", function(ev){
            fillTT(ev);
            window.clearTimeout(timer);
            timer=window.setTimeout(hideTT,ttime);
        });
        d3el.on("pointerdown", function(ev){
            showTT(ev);
            timer=window.setTimeout(hideTT,5000);
        });
    }
    HistoryChart.prototype.getFormatterFunction = function (field, index) {
        let defaultF=function (row) {
            return row[index + 1]
        };
        if (!field.formatter) {
            return defaultF;
        }
        let formatter = field.formatter;
        if (typeof(formatter) === "string"){
            formatter=window[NAME].HistoryFormatter[formatter];
            if (! formatter) return defaultF;
        }
        if (typeof (formatter) === "function") {
            return function (row) {
                return formatter(row[index + 1])
            }
        } else {
            return function (row) {
                return formatter.f(row[index + 1])
            }
        }
    }
    HistoryChart.prototype.getYtitle=function(field){
        if (! field.formatter) return;
        let formatter=field.formatter;
        if (typeof("formatter") === 'string'){
            formatter=window[NAME].HistoryFormatter[formatter];
            if (! formatter) return;
        }
        if (typeof(formatter) !== 'object') return;
        return formatter.unit;
    }
    HistoryChart.prototype.createChart=function(serverData,fields){
        let self=this;
        let data=serverData.data;
        //we rely on the server having the same order of fields as we have...
        let yaxiswidth=50;
        let margin = {top: 10, right: 30, bottom: 30, left: yaxiswidth};
        let chart=document.getElementById(this.element);
        let rect=chart.getBoundingClientRect();
        let width=rect.width-margin.left-margin.right;
        let height=rect.height-margin.top-margin.bottom;
        let svg = d3.select("#"+this.element)
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
            let vf=self.getFormatterFunction(field,idx);
            if (currentY === undefined || (field.ownAxis === undefined || field.ownAxis)) {
                let ext=d3.extent(data,vf);
                currentY = d3.scaleLinear()
                    .domain([ext[0] >= 0?0:ext[0],ext [1]]).nice()
                    .range([height, 0]);
                svg.append("g")
                    .attr("transform","translate("+leftMargin+",0)")
                    .attr("stroke", field.color)
                    .call(d3.axisLeft(currentY));
                let unit=self.getYtitle(field);
                if (unit) {
                    svg.append('text')
                        .attr('text-anchor', 'end')
                        .attr('x', leftMargin-10)
                        .attr('y', margin.top+20)
                        //.attr('stroke',field.color)
                        .attr('fill',field.color)
                        .text(unit)
                }
                leftMargin+=50;
            }
            let gr=svg.append("path")
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
                        return currentY(vf(d))
                    })
                )
            self.addToolTip(gr,x,currentY,field.name);
        }

    }
    if (! window[NAME]) window[NAME]={};
    window[NAME].HistoryChart=HistoryChart;
    if (! window[NAME].HistoryFormatter) window[NAME].HistoryFormatter={};
    try{
        //try to read some formatters that potentially have been set in the user.js
        let parentWindow=window.parent;
        if (parentWindow && parentWindow[NAME]){
            let parentFormatters=parentWindow[NAME].HistoryFormatter;
            if (parentFormatters){
                for (let p in parentFormatters){
                    window[NAME].HistoryFormatter[p]=parentFormatters[p];
                }
            }
        }
    }catch (e){
        console.log("unable to read parent");
    }
    window[NAME].HistoryFormatter.hectoPascal={unit:'hPa',f:function(v){return v/100}};
    window[NAME].HistoryFormatter.celsius={unit:'°',f:function(v){return v-273.15}};
    window[NAME].HistoryFormatter.knots={unit:'kn',f:function(v){return v*3600.0/1852.0}};
    window[NAME].HistoryFormatter.default=function(v){return v};
})();


