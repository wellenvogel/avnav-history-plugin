console.log("history diagram loaded");
(function(){
    let NAME="avnavHistoryPlugin";
    let HistoryChart=function(element,opt_options) {
        this.useToolTip=! opt_options || (opt_options.tooltip || opt_options.tooltip === undefined);
        this.element=element;
        this.currentData=[];
        this.currentFields=[];
        this.currentYScales=[];
        this.xScale=undefined;
    }
    HistoryChart.prototype.setChartElement=function(newel){
        if (this.element){
            this.removeChart();
            this.element=undefined;
        }
        this.element=newel;
    }
    HistoryChart.prototype.getChartElement=function(){
        return typeof(this.element) === 'string'? document.querySelector(this.element):this.element;
    }
    HistoryChart.prototype.removeChart=function(){
        let chart=this.getChartElement();
        if (chart) chart.innerHTML="";
        if (this.tooltip){
            this.tooltip.node().parentNode.removeChild(this.tooltip.node());
            this.tooltip=undefined;
        }
    }
    HistoryChart.prototype.format2=function (v){
        v=parseInt(v);
        return ("0"+v.toFixed(0)).substr(-2);
    }
    HistoryChart.prototype.formatDate=function(dt){
        return dt.getFullYear()+"/"+this.format2(dt.getMonth()+1)+"/"+this.format2(dt.getDate())+" "+
            this.format2(dt.getHours())+":"+this.format2(dt.getMinutes());
    }
    /**
     * add a tooltip to the chart
     * as only selecting the real curves does not work on touch devices (points too small)
     * we capture events on the outer dive and compute the value by our own
     * we first determine the best matching time from the data (within a pixel tolerance) and
     * afterwards find the data item that is closest to our touch/click point
     * @param d3el the outer div of the chart
     * @param leftMargin left margin of the chart data relative to the d3el
     * @param topMargin top margin of the chart relative to the div
     */
    HistoryChart.prototype.addToolTip=function(d3el,leftMargin,topMargin){
        let self=this;
        let ttPoint;
        if (! this.useToolTip) return;
        if (! this.tooltip){
            this.tooltip = d3.select("body")
                .append("div")
                .style("position", "absolute")
                .style("z-index", "10")
                .style("visibility", "hidden")
                .text("a simple tooltip");
            this.tooltip.node().classList.add('tooltip');
            this.tooltip.on("click", function () {
                hideTT();
            })
        }
        let timer=undefined;
        let ttime=8000;
        let pixTolerance=25;
        function fillTT(ev){
            if (! self.tooltip) return;
            let xy=d3.pointer(ev);
            let dt=self.xScale.invert(xy[0]-leftMargin);
            //find the index in the current values
            let bisectD=d3.bisector(function(row,x){return (row[0]*1000) - x }).center;
            let idx=bisectD(self.currentData,dt.getTime());
            let directions=[+1,-1];
            let minDistance;
            let currentTarget;
            let tv;
            directions.forEach(function(dir) {
                let currentIdx=idx;
                let dx=0;
                while (dx < pixTolerance) {
                    if (currentIdx < 0 || currentIdx >= self.currentData.length) break;
                    tv=self.currentData[currentIdx][0]*1000;
                    dx=Math.abs(leftMargin+self.xScale(tv)-xy[0]);
                    if (dx >= pixTolerance) break;
                    //now look around in the current Values
                    for (let i=0;i<self.currentFields.length;i++){
                        let v=self.currentData[currentIdx][i+1];
                        if (isNaN(v) || v === null) continue;
                        let fmt=self.getFormatterFunction(self.currentFields[i],i);
                        v=fmt(self.currentData[currentIdx]);
                        let px=self.currentYScales[i](v)+topMargin;
                        let dy=Math.abs(px-xy[1]);
                        if (dy > pixTolerance) continue;
                        let dst=(dx*dx + dy*dy);
                        if (minDistance === undefined || dst < minDistance){
                            minDistance=dst;
                            currentTarget={x:currentIdx,f:i,v:v,tv:tv,y:px};
                        }
                    }
                    currentIdx+=dir;
                }
            });
            if (! currentTarget) return;
            self.tooltip.style("top", (ev.pageY-10)+"px").style("left",(ev.pageX+10)+"px");
            self.tooltip.html(escape(self.currentFields[currentTarget.f].name)+"<br/>"
                +self.formatDate(new Date(currentTarget.tv))+"<br/>"
                +currentTarget.v.toFixed(3)
            );
            if (! ttPoint){
                ttPoint=d3el.select('svg').append('circle')
                    .attr('r',2)
                    .attr('fill','black');
            }
            ttPoint.attr('cx',leftMargin+self.xScale(currentTarget.tv));
            ttPoint.attr('cy',currentTarget.y);
            return true;
        }
        function showTT(ev){
            if (! self.tooltip) return;
            if (fillTT(ev))self.tooltip.style("visibility", "visible");
        }
        function hideTT(){
            if (! self.tooltip) return;
            self.tooltip.style("visibility", "hidden");
            if (ttPoint){
                ttPoint.remove();
                ttPoint=undefined;
            }
        }
        d3el.on("pointerover", function(ev){
            ev.preventDefault();
            showTT(ev);
            window.clearTimeout(timer);
            timer=window.setTimeout(hideTT,ttime);
        });
        d3el.on("pointermove", function(ev){
            ev.preventDefault();
            showTT(ev);
            window.clearTimeout(timer);
            timer=window.setTimeout(hideTT,ttime);
        });
        d3el.on("pointerdown", function(ev){
            ev.preventDefault();
            showTT(ev);
            window.clearTimeout(timer);
            timer=window.setTimeout(hideTT,ttime);
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
    /**
     * draw a chart based on the received data from the server and the field definitions
     * @param serverData a json object having the values in data (order of values must match the order in fields)
     * @param fields the field definitions (name,color,formatter,enabled)
     * @param opt_showLines if true - show lines instead of points
     */
    HistoryChart.prototype.createChart=function(serverData,fields,opt_showLines){
        let self=this;
        let data=serverData.data;
        this.currentData=data;
        this.currentFields=fields;
        this.currentYScales=[];
        //we rely on the server having the same order of fields as we have...
        let yaxiswidth=50;
        let margin = {top: 10, right: 30, bottom: 30, left: yaxiswidth};
        let chart=this.getChartElement();
        if (! chart) return;
        let rect=chart.getBoundingClientRect();
        let width=rect.width-margin.left-margin.right;
        let height=rect.height-margin.top-margin.bottom;
        let svg = d3.select(this.element)
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
        this.xScale=d3.scaleTime()
                .domain(d3.extent(data,function(d){return d[0]*1000}))
                .range([addLeft,width]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(this.xScale)
                .tickFormat(d3.timeFormat("%d/%Hh"))
            );
        let currentY;
        let leftMargin=0;
        for (let idx=0;idx<fields.length;idx++) {
            //new y axis?
            let field = fields[idx];
            let vf = self.getFormatterFunction(field, idx);
            if (currentY === undefined || (field.ownAxis === undefined || field.ownAxis)) {
                let ext = d3.extent(data.filter(function(row){
                    return ! (isNaN(row[idx+1]) || row[idx+1] === null)
                    }
                ), vf);
                currentY = d3.scaleLinear()
                    .domain([ext[0] >= 0 ? 0 : ext[0], ext [1]]).nice()
                    .range([height, 0]);
                svg.append("g")
                    .attr("transform", "translate(" + leftMargin + ",0)")
                    .attr("stroke", field.color)
                    .call(d3.axisLeft(currentY));
                let unit = self.getYtitle(field);
                if (unit) {
                    svg.append('text')
                        .attr('class','unit')
                        .attr('text-anchor', 'end')
                        .attr('x', leftMargin - 10)
                        .attr('y', margin.top + 20)
                        .attr('fill', field.color)
                        .text(unit)
                }
                leftMargin += yaxiswidth;
            }
            let gr;
            if (opt_showLines) {
                gr = svg.append("path")
                    .datum(data)
                    .attr("fill", "none")
                    .attr("stroke", field.color)
                    .attr("stroke-width", 1.5)
                    .attr("d", d3.line()
                        .defined(function (d) {
                            return !isNaN(d[idx + 1]) && d[idx + 1] !== null
                        })
                        .x(function (d) {
                            return self.xScale(d[0] * 1000)
                        })
                        .y(function (d) {
                            return currentY(vf(d))
                        })
                    )
            } else {
                gr = svg.append("g")
                    .selectAll('dot')
                    .data(data)
                    .enter()
                    .append('circle')
                    .attr("fill", "none")
                    .attr("fill", field.color)
                    .attr("r", 1)
                    .attr("visibility",
                        function (d) {
                            return (!isNaN(d[idx + 1]) && d[idx + 1] !== null) ? undefined : "hidden"
                        })
                    .attr("cx", function (d) {
                        return self.xScale(d[0] * 1000)
                    })
                    .attr("cy", function (d) {
                        return currentY(vf(d))
                    });
            }
            this.currentYScales.push(currentY);
        }
        self.addToolTip(d3.select(chart),margin.left,margin.top);

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
    //register our formatters
    //we do this at a global level to give the user a change to add its own
    window[NAME].HistoryFormatter.hectoPascal={unit:'hPa',f:function(v){return v/100}};
    window[NAME].HistoryFormatter.celsius={unit:'°',f:function(v){return v-273.15}};
    window[NAME].HistoryFormatter.knots={unit:'kn',f:function(v){return v*3600.0/1852.0}};
    window[NAME].HistoryFormatter.default=function(v){return v};
})();


