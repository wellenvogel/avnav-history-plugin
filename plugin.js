console.log("avnav history plugin loaded");
let chartHandlerName="avnavHistoryPlugin";

let tryCreateChartHandler=function(context) {
    if (context.chartHandler) return context.chartHandler;
    if (!window[chartHandlerName]) return;
    if (!window[chartHandlerName].HistoryChart) return;
    context.chartHandler = new window[chartHandlerName].HistoryChart(undefined,{tooltip:false});
    return context.chartHandler;
}

const findFormatter = function (name) {
        if (window[chartHandlerName] && window[chartHandlerName].HistoryFormatter) {
            return window[chartHandlerName].HistoryFormatter[name];
        }
    }

let HistoryWidget={
    name: 'HistoryWidget',
    initFunction:function (context){
        tryCreateChartHandler(context);
        context.isActive=true;
    },
    translateFunction: function(props){
        let fmt=findFormatter(props.fieldFormatter);
        if (fmt && fmt.unit && ! props.unit && props.unitFromFormatter){
            props.unit=fmt.unit;
        }
        return props;
    },
    renderHtml:function(props){
        if (this.timer) window.clearInterval(this.timer);
        this.timer=undefined;
        let style=""
        if (props.height){
            style="style=\"height:"+props.height+"px;min-height:"+props.height+"px;\"";
        }
        return '<div class="chartFrame" '+style+'></div>';
    },
    /**
     * we must "misuse" the renderCanvas here
     * only when renderCanvas is called all our HTML elements are already created
     * and it will for sure be called whenever the widget is newly rendered
     * @param canvasEl
     * @param props
     */
    renderCanvas:function(canvasEl,props){
        if (!canvasEl) return;
        let widget=canvasEl.parentElement;
        if (! widget) return;
        let chartHandler=tryCreateChartHandler(this);
        if (! chartHandler) return;
        if (!props.fieldName) return;
        let url=AVNAV_BASE_URL+"/api/history?fields="+encodeURIComponent(props.fieldName);
        if (props.hours){
            url+="&fromTime="+encodeURIComponent((new Date().getTime())/1000-3600*props.hours);
        }
        let self=this;
        fetch(url)
            .then(function(resp){return resp.json()})
            .then(function(data){
                let fieldDef={
                    name:props.fieldName,
                    formatter: props.fieldFormatter,
                    color: props.color
                };
                let fieldDefs=[fieldDef];

                if (props.movingAverage && props.averagingWindow > 1){
                    HistoryWidget.addMovingAverage(data, props.averagingWindow);
                    let fieldDefAvg={
                        name:props.fieldName + "_avg(" + props.averagingWindow + ")",
                        formatter: props.fieldFormatter,
                        color: props.averageColor,
                        dashed: true,
                        ownAxis: false
                    };
                    fieldDefs.push(fieldDefAvg);
                }

                let chart=widget.querySelector('.chartFrame');
                if (! chart) return ;
                self.sequence=data.sequence;
                chartHandler.setChartElement(chart);
                if (self.timer) window.clearInterval(self.timer);
                let timerInterval=(data.period||30)/5;
                if (timerInterval < 1) timerInterval=1;
                //periodically query the server to check if some data has changed
                self.timer=window.setInterval(function(){
                    let url=AVNAV_BASE_URL + "/api/status";
                    fetch(url)
                        .then(function(resp){return resp.json()})
                        .then(function(status){
                            if (!self.isActive) return;
                            if (status.sequence !== self.sequence){
                                //data in plugin has changed - redraw
                                self.triggerRedraw();
                                window.clearInterval(self.timer);
                                self.timer=undefined;
                            }
                        })
                        .catch(function(error){})
                },timerInterval*1000);
                chartHandler.createChart(data,fieldDefs,props.showLines,props.yMin,props.yMax);

            })
            .catch(function(error){console.log(error)});
    },
    finalizeFunction:function(context){
        if (context.chartHandler){
            context.chartHandler.removeChart();
        }
        if (context.timer){
            window.clearInterval(context.timer);
        }
        context.isActive=false;
    },

    /**
     * Adds a moving average field to the data object.
     * @param {*} data the data object as retrieved from the server 
     * @param {*} windowSize size of elements to use for moving average
     * @returns 
     */
    addMovingAverage:function(data, windowSize) {
        const movingAverageData = this.calcMovingAverage(data.data, 1, windowSize);
        data.data = movingAverageData;
        const avgFieldName = `${data.fields[0]}_average(${windowSize})`;
        data.fields.push(avgFieldName);
        return data;
    },

    calcMovingAverage:function(data, valueIndex, windowSize) {
        if (!Array.isArray(data) || data.length === 0) return [];
        if (windowSize <= 0) throw new Error('Window size must be greater than 0');
        if (valueIndex < 0 || valueIndex >= data[0].length) throw new Error('Invalid value index');
        const result = [];
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i][valueIndex];
            if (i >= windowSize) {
                sum -= data[i - windowSize][valueIndex];
            }
            const count = i < windowSize ? i + 1 : windowSize;
            const avg = sum / count;
            let newRow = data[i].slice() 
            newRow.push(avg);
            result.push(newRow);
        }
        return result;
    }
}



let fileref=document.createElement('script');
fileref.setAttribute("type","text/javascript");
fileref.setAttribute("src", AVNAV_BASE_URL+"/historychart.js");
fileref.addEventListener('load', function () {
    let statusUrl = AVNAV_BASE_URL + "/api/status";
    let data=undefined;
    let lastQuery=undefined;
    let queryPeriod=3000;
    const fetchData=function(){
        return new Promise(function(resolve,reject){
            let now=(new Date()).getTime();
            if (lastQuery !== undefined && (lastQuery+queryPeriod) >= now){
                resolve(data);
            }
            fetch(statusUrl)
            .then(function (resp) {
                const contentType = resp.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return resp.json()
                }
                else{
                    resolve(null);
                }
            })
            .then(function (jsdata) {
                data=jsdata;
                lastQuery=now;
                resolve(data);
            })
            .catch(function(error){reject(error)});
        });
    };
    const getFormatters = function () {
        let formatters = [];
        if (window[chartHandlerName] && window[chartHandlerName].HistoryFormatter) {
            for (let f in window[chartHandlerName].HistoryFormatter) {
                formatters.push(f);
            }
        }
        if (formatters.length < 1) formatters.push("default");
        return formatters;
    }
    const getFields = function(){
        return new Promise(function(resolve,reject){
            fetchData()
            .then(function(fetched){
                resolve(fetched.fields);
            })
            .catch(function(e){reject(e)});
        })
    }
    
    const hoursFromData = function (data) {
        const allHours = [0.25, 0.5, 1, 2, 4, 8, 12, 24, 48, 72]; 
        const truncatedHours = allHours.filter(hour => hour < data.storeTime); 
        truncatedHours.push(data.storeTime); 
        return truncatedHours.map(String); 
    };

    const getHours = function(){
        return new Promise(function(resolve,reject){
            fetchData()
            .then(function(fetched){
                resolve(hoursFromData(fetched));
            })
            .catch(function(e){reject(e)});
        })
    }
    fetchData()
        .then(function (data) {
            if (data == null) return;
            let allowPromise=window.avnav.api.getAvNavVersion && window.avnav.api.getAvNavVersion() >= 20210316;
            let fields=allowPromise?getFields:data.fields;
            let hours=allowPromise?getHours:hoursFromData(data);
            let widgetParameters = {
                formatter: false,
                formatterParameters: false,
                value: false,
                fieldName: {type: 'SELECT', default: data.fields[0], list: fields},
                color: {type: 'COLOR', default: '#000000'},
                fieldFormatter: {type: 'SELECT', default: 'default', list: getFormatters()},
                unitFromFormatter: {type: 'BOOLEAN',default: true,description: 'use the unit from the field formatter if no unit parameter is given'},
                hours: {type: 'SELECT', default: hours[0], list: hours},
                yMin: {type: 'STRING', default: ''},
                yMax: {type: 'STRING', default: ''},
                showLines: {name: 'show lines', type: 'BOOLEAN', default: false},
                movingAverage: {name: 'show average', type: 'BOOLEAN', default: false, description: 'adds a dashed line with a moving average'},
                averageColor: {type: 'COLOR', default: "#0000ff",description: 'color for the average graph',condition:{movingAverage: true}},
                averagingWindow: {name: 'window size', type: 'NUMBER', default: 10, description: 'window size for moving average ',condition:{movingAverage: true}},
                height: {name: 'height(px)',type: 'NUMBER',default:0,description:'set the widget height in px, 0 for default (ignored on dashboard)'}
            };

            window.avnav.api.registerWidget(HistoryWidget, widgetParameters);
        })
        .catch(function (error) {
            window.avnav.api.showToast("history widget error: "+error);
        })
});


document.getElementsByTagName("head")[0].appendChild(fileref)
fileref=document.createElement('script');
fileref.setAttribute("type","text/javascript");
fileref.setAttribute("src", AVNAV_BASE_URL+"/lib/d3.v6.min.js");
document.getElementsByTagName("head")[0].appendChild(fileref)



