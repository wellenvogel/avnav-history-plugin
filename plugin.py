import time
import threading
import time
import os
import datetime
import sys
import re
import glob

REC_HDR='H'
REC_DATA='D'
NAME="history"

class HistoryFileWriter:
  def __init__(self,filename,fields,ts=None):
    self.filename=filename
    self.fields=fields
    self.file=open(filename,"a")
    if ts is None:
      ts=time.time()
    self.file.write("\n")  #if the previous line was not completed...
    self.writeRecord(REC_HDR,[str(ts)]+self.fields,False)

  def isOpen(self):
    return self.file is not None

  def writeRecord(self,type,fields,toStrings=True):
    self.file.write("%s,"%type)
    if toStrings:
      self.file.write(",".join(map(lambda a: str(a) if a is not None else '',fields)))
    else:
      self.file.write(",".join(fields))
    self.file.write("\n")
    self.file.flush()

  def close(self):
    if self.file is None:
      return
    self.file.close()


class HistoryFileReader:
  def __init__(self,filename,fields,api=None):
    self.filename=filename
    self.fields=fields
    self.file=None
    self.requestedFields=fields
    self.api=api
    if os.path.isfile(filename):
      self.file=open(filename,"r")

  def isOpen(self):
    return self.file is not None

  def computeMappings(self,newHdrLine):
    if len(newHdrLine) < 3:
      return None
    mappings={}
    for f in range(0,len(self.fields)):
      for i in range(2,len(newHdrLine)):
        if newHdrLine[i]==self.fields[f]:
          mappings[i]=f
    return mappings

  def getRecords(self,minTime=None,maxTime=None):
    self.file.seek(0)
    rt=[]
    #mapping maps the filed in the file to the position
    #in the putput array
    mapping=None
    try:
      for line in self.file:
        fields = line.rstrip().split(",")
        if line.startswith(REC_HDR):
          mapping=self.computeMappings(fields)
          continue
        if mapping is None:
          continue
        if not line.startswith(REC_DATA):
          continue
        if len(fields) < 3:
          continue
        try:
          ts=float(fields[1])
          if minTime is not None and ts < minTime:
            continue
          if maxTime is not None and ts > maxTime:
            return rt
          opline=[None] * (len(self.fields)+1)
          opline[0]=ts #timestamp
          hasFields=False
          for i in range(2,len(fields)):
            idx=mapping.get(i)
            if idx is None:
              continue
            if fields[i] is None or fields[i] == "":
              continue
            opline[idx+1]=float(fields[i])
            hasFields=True
          if hasFields:
            rt.append(opline)
        except:
          if self.api is not None:
            self.api.debug("unable to read record %s",line)
          continue
    except Exception as e:
      if self.api is not None:
        self.api.error("Error reading from file %s: %s",self.filename,str(e))
    return rt

  def close(self):
    if self.file is None:
      return
    self.file.close()

class Average:
  def __init__(self):
    self.count=0
    self.sum=None
  def add(self,value):
    if value is None:
      return
    try:
      if self.sum is None:
        self.sum=float(value)
        self.count+=1
      else:
        self.sum+=float(value)
        self.count += 1
      return True
    except:
      return False
  def cur(self):
    if self.count == 0 or self.sum is None:
      return self.sum
    return float(self.sum)/float(self.count)
  def reset(self):
    self.count=0
    self.sum=None
  def hasData(self):
    return self.count > 0 and self.sum is not None




class Plugin:
  CONFIG=[
    {
      'name': 'period',
      'description': 'period for writing in s',
      'default': 30,
      'type': 'NUMBER'
    }
    ,
    {
      'name': 'pollingInterval',
      'description': 'polling interval for internal store (seconds), defaults to period/10',
      'default': 30,
      'type':'NUMBER'
    }
    ,

    {
      'name': 'storeTime',
      'description': 'how long to store the history (h)',
      'default': 48,
      'type':'NUMBER'
    }

  ]
  OLD_CONFIG=[{
               'name': 'sensorNames',
               'description': 'the sensor names we look for in XDR records separated by ,',
               'default': None
             },
            {
              'name': 'storeKeys',
              'description': 'data to be fetched from the AvNav internal store ,',
              'default': None
            }
  ]

  @classmethod
  def pluginInfo(cls):
    """
    the description for the module
    @return: a dict with the content described below
            parts:
               * description (mandatory)
               * data: list of keys to be stored (optional)
                 * path - the key - see AVNApi.addData, all pathes starting with "gps." will be sent to the GUI
                 * description
    """
    return {
      'description': 'seatalk remote control',
      'config': cls.CONFIG+cls.OLD_CONFIG ,
      'data': [
      ]
    }

  def __init__(self,api):
    """
        initialize a plugins
        do any checks here and throw an exception on error
        do not yet start any threads!
        @param api: the api to communicate with avnav
        @type  api: AVNApi
    """
    self.api = api # type: AVNApi
    #we register an handler for API requests
    self.api.registerRequestHandler(self.handleApiRequest)
    self.xdrNames=None
    self.dataKeys=None
    self.storeKeys=None
    self.storePollingPeriod=None
    self.values=[]
    self.baseDir=None
    self.storeTime=None
    self.period=None
    self.sequence=1 #changed if new data is added or data removed
    self.changeSequence=0
    self.startSequence=0
    self.canEdit=False
    if hasattr(self.api,'registerEditableParameters'):
      self.api.registerEditableParameters(self.CONFIG,self._changeConfig)
      self.canEdit=True
    if hasattr(self.api,'registerRestart'):
      self.api.registerRestart(self._apiRestart)

  def _apiRestart(self):
    self.startSequence+=1
    self.changeSequence+=1

  def _changeConfig(self,newValues):
    self.api.saveConfigValues(newValues)
    self.changeSequence+=1


  def updateSequence(self):
    self.sequence+=1

  def computeFileName(self,daysDiff=0):
    now=datetime.datetime.utcnow()
    if daysDiff != 0:
      now+=datetime.timedelta(days=daysDiff)
    return os.path.join(self.baseDir,str(now.strftime("%Y-%m-%d")+".avh"))

  def getAllFileNames(self):
    '''
    get all needed filenames depending on the storeTime
    :return:
    '''
    days = int(self.storeTime / 24) + 1
    files = []
    for d in range(days + 1,-1,-1):
      files.append(self.computeFileName(-d))
    return files

  def getConfigValue(self,name):
    defaults=self.pluginInfo()['config']
    for cf in defaults:
      if cf['name'] == name:
        return self.api.getConfigValue(name,cf.get('default'))
    return self.api.getConfigValue(name)

  def convertValue(self, value, unit):
    '''

    :param value:
    :param type:
    :return:
    '''
    #see e.g. https://gpsd.gitlab.io/gpsd/NMEA.html#_xdr_transducer_measurement
    if unit == "C":
      value+=273.15
    if unit == "B":
      value=value*100*1000
    return value

  STOP_RETURN=0
  STOP_AGAIN=1
  STOP_WAIT=2

  def run(self):
    startSequence=self.startSequence
    self.api.registerUserApp(self.api.getBaseUrl()+'/index.html',os.path.join('icons','show_chart.svg'),'History')
    while startSequence == self.startSequence:
      rt=self.runInternal()
      if rt is None or rt == self.STOP_RETURN:
        return
      if rt == self.STOP_WAIT:
        changeSequence=self.changeSequence
        while changeSequence == self.changeSequence:
          time.sleep(1)


  def runInternal(self):
    """
    the run method
    this will be called after successfully instantiating an instance
    this method will be called in a separate Thread
    The example simply counts the number of NMEA records that are flowing through avnav
    and writes them to the store every 10 records
    @return:
    """
    changeSequence=self.changeSequence
    seq=0
    self.values=[]
    self.api.log("started")
    enabled=self.getConfigValue('enabled')
    if enabled is not None and enabled.lower()!='true':
      self.api.setStatus("INACTIVE", "disabled by config")
      return self.STOP_RETURN
    try:
      self.period=float(self.getConfigValue('period'))
    except Exception as e:
      self.api.setStatus("ERROR", "error getting period: %s" % str(e))
      return self.STOP_WAIT
    try:
      self.storeTime=float(self.getConfigValue('storeTime'))
    except Exception as e:
      self.api.setStatus("ERROR", "error getting storeTime: %s" % str(e))
      return self.STOP_WAIT
    sensors=self.getConfigValue('sensorNames')
    self.dataKeys=[]
    if sensors is not None:
      self.xdrNames=list(filter(lambda k: k != "",sensors.split(",")))
      self.dataKeys.extend(self.xdrNames)
    storeKeys=self.getConfigValue('storeKeys')
    if storeKeys is not None:
      self.storeKeys=list(filter(lambda k: k != "",storeKeys.split(",")))
      self.dataKeys.extend(self.storeKeys)
    if len(self.dataKeys) < 1:
      self.api.setStatus("ERROR", "no parameter sensorNames or storeKeys configured")
      return self.STOP_WAIT
    if self.dataKeys[0] == "":
      self.api.setStatus("ERROR", "empty parameter sensorNames / storeKeys configured")
      return self.STOP_WAIT
    self.baseDir=os.path.join(self.api.getDataDir(),"plugins",NAME)
    if not os.path.exists(self.baseDir):
      os.makedirs(self.baseDir)
    if not os.path.isdir(self.baseDir):
      self.api.setStatus("ERROR", "unable to create basedir %s"%self.baseDir)
      raise Exception("unable to create basedir %s"%self.baseDir)
    self.storePollingPeriod=self.getConfigValue('pollingInterval')
    if self.storePollingPeriod is None:
      self.storePollingPeriod=self.period/10
      if self.storePollingPeriod < 1:
        self.storePollingPeriod=1
    else:
      try:
        self.storePollingPeriod=float(self.storePollingPeriod)
        if self.storePollingPeriod < 1:
          self.storePollingPeriod=1
        if self.storePollingPeriod > self.period/2:
          self.storePollingPeriod=self.period/2
      except Exception as e:
        self.api.setStatus("ERROR","unable to get store period: %s"%str(e))
        return self.STOP_WAIT
    minTime=time.time()-self.storeTime*3600
    currentFile = self.computeFileName()
    allFiles=self.getAllFileNames()
    for historyFile in allFiles:
      try:
        if os.path.exists(historyFile):
          self.api.log("reading file %s", historyFile)
          reader=HistoryFileReader(historyFile,self.dataKeys,self.api)
          self.values.extend(reader.getRecords(minTime))
          reader.close()
      except Exception as e:
        self.api.error("error reading history: %s",str(e))
    self.api.log("%d entries in history", len(self.values))
    cleanupThread=threading.Thread(target=self.cleanup,name="barograph-cleanup")
    cleanupThread.setDaemon(True)
    cleanupThread.start()
    currentValues={}
    self.updateSequence()
    for f in self.dataKeys:
      currentValues[f]=Average()
    lastWrite=0
    hasValues=False
    hwriter=HistoryFileWriter(currentFile,self.dataKeys)
    self.api.setStatus("INACTIVE","writing to %s"%currentFile)
    dataReceived=False
    waitTime=0.3
    lastStorePoll=0
    while changeSequence == self.changeSequence:
      try:
        seq,data=self.api.fetchFromQueue(seq,10,filter="$XDR",waitTime=waitTime)
        if len(data) > 0:
          for line in data:
            #$--XDR,a,x.x,a,c--c, ..... *hh<CR><LF>
            line=re.sub("\*.*","",line.rstrip())
            fields=line.split(",")
            lf=len(fields)
            i=1
            while i < lf:
              if i < (lf-3):
                try:
                  #we need 4 fields
                  if fields[i+1] is not None and fields[i] != "":
                    ttype=fields[i]
                    tdata=float(fields[i+1])
                    tunit=fields[i+2]
                    tname=fields[i+3]
                    if tname in self.dataKeys:
                      self.api.debug("received %f for %s",tdata,tname)
                      currentValues[tname].add(self.convertValue(tdata,tunit))
                      hasValues=True
                except Exception as e:
                  self.api.error("NMEA error in %s: %s",line,str(e))
              i+=4
        now=time.time()
        if self.storeKeys is not None and len(self.storeKeys) > 0 and (now >= (lastStorePoll + self.storePollingPeriod) or now < lastStorePoll):
          for sk in self.storeKeys:
            try:
              v=self.api.getSingleValue(sk)
              if currentValues[sk].add(v):
                hasValues=True
            except Exception as e:
              self.api.debug("unable to fetch %s: %s",sk,str(e))
          lastStorePoll=now
        if hasValues and (now >= (lastWrite+self.period) or now < lastWrite):
          if not dataReceived:
            self.api.setStatus("NMEA","writing to %s"%hwriter.filename)
            dataReceived=True
          record=[now]
          for f in self.dataKeys:
            v=currentValues[f].cur()
            currentValues[f].reset()
            record.append(v)
          nextFile=self.computeFileName()
          if nextFile != hwriter.filename:
            self.api.log("opening new file %s",nextFile)
            dataReceived=False
            hwriter.close()
            hwriter=HistoryFileWriter(nextFile,self.dataKeys)
          self.values.append(record)
          hwriter.writeRecord(REC_DATA,record)
          self.updateSequence()
          lastWrite=now
          hasValues=False
      except Exception as e:
        self.api.error("error in plugin loop: %s",str(e))
    return self.STOP_AGAIN

  def cleanup(self):
    changeSequence=self.changeSequence
    lastCleanup=0
    while changeSequence == self.changeSequence:
      now=time.time()
      if now < (lastCleanup +60) and now >= lastCleanup:
        time.sleep(1)
        continue
      lastCleanup=now
      self.api.debug("cleanup loop")
      cleanupTime=time.time()-self.storeTime*3600
      numRemoved=0
      while len(self.values) >0 and self.values[0][0] < cleanupTime:
        self.values.pop(0)
        numRemoved+=1
      if numRemoved > 0:
        self.updateSequence()
      self.api.debug("removed %d entries from history",numRemoved)
      keepFiles=[self.computeFileName(+1)]
      keepFiles.extend(self.getAllFileNames())
      currentFiles = glob.glob(os.path.join(self.baseDir, u"*.avh"))
      for file in currentFiles:
        if file in keepFiles:
          continue
        self.api.log("removing old file %s",file)
        os.remove(file)



  def getFilteredValues(self,indices,row):
    rt=[row[0]]
    for i in indices:
      if i>=0 and i < len(row):
        rt.append(row[i])
      else:
        rt.append(None)
    return rt

  def _getRequestParam(self,param,name,raiseMissing=True):
    data = param.get(name)
    if data is None or len(data) != 1:
      if not raiseMissing:
        return None
      raise Exception("missing parameter %s"%name)
    return data[0]

  def _appendKeys(self,keylist,storeData,prefix=None):
    BLACKLIST=['tag','source','mode','updatealarm','updateleg','updateroute']
    if prefix is None:
      prefix='gps'
    else:
      BLACKLIST=[]
    for k,v in storeData.items():
      if type(v) is not dict:
        if k not in BLACKLIST:
          keylist.append(prefix+'.'+k)
      else:
        self._appendKeys(keylist,v,prefix+'.'+k)
  def handleApiRequest(self,url,handler,args):
    """
    handler for API requests send from the JS
    @param url: the url after the plugin base
    @param handler: the HTTP request handler
                    https://docs.python.org/2/library/basehttpserver.html#BaseHTTPServer.BaseHTTPRequestHandler
    @param args: dictionary of query arguments
    @return:
    """
    if url == 'status':
      return {'status': 'OK',
              'numRecords':len(self.values),
              'oldest': self.values[0][0] if len(self.values) else None,
              'fields': self.dataKeys,
              'period': self.period,
              'storeTime': self.storeTime,
              'sequence': self.sequence,
              'canEdit': self.canEdit
              }
    if url == 'history':
      fromTime=args.get('fromTime')
      if fromTime is not None:
        fromTime=float(fromTime[0])
      toTime=args.get('toTime')
      if toTime is not None:
        toTime=float(toTime[0])
      indices=None
      keys=args.get('fields')
      if keys is not None:
        keys=keys[0].split(",")
        indices=[]
        for k in keys:
          for i in range(0,len(self.dataKeys)):
            if k == self.dataKeys[i]:
              indices.append(i+1) #first element is always the time
      else:
        keys=self.dataKeys
      if indices is not None and len(indices) < 1:
        values=[]
      else:
        values=list(map(lambda r: r if indices is None else self.getFilteredValues(indices,r),
                 list(filter(lambda r:
                      (fromTime is None or r[0] >= fromTime) and (toTime is None or r[0] <= toTime),
                      self.values))))
      return {
        'status':'OK',
        'fields': keys,
        'period': self.period,
        'sequence': self.sequence,
        'data':values
      }

    if url == 'listKeys':
      storeData=self.api.getDataByPrefix('gps')
      keylist=[]
      self._appendKeys(keylist,storeData)
      return {
        'status':'OK',
        'data':keylist
      }
    if url == 'getKeys':
      return {
        'status':'OK',
        'data': self.getConfigValue('storeKeys')
      }
    if url == 'saveSettings':
      if not self.canEdit:
        raise Exception("unable to store settings in this version")
      newKeys=self._getRequestParam(args,'storeKeys')
      period=self._getRequestParam(args,'period',raiseMissing=False)
      storeTime=self._getRequestParam(args,'storeTime',raiseMissing=False)
      sensorNames=self._getRequestParam(args,'sensorNames',raiseMissing=False)
      newConfig={'storeKeys':newKeys}
      if period is not None:
        period=float(period)
        if (period < 1 ):
          raise Exception("period must be > 1")
        newConfig['period']=period
      if storeTime is not None:
        storeTime=float(storeTime)
        if (storeTime < 1):
          raise Exception("store time must be > 1")
      if sensorNames is not None:
        newConfig['sensorNames']=sensorNames
      self._changeConfig(newConfig)
      return {'status':'OK'}

    return {'status','unknown request'}


