#! /usr/bin/env python

from plugin import *
import random

def err(text):
  print("ERROR: %s"%text)
  sys.exit(1)

if __name__ == '__main__':
  #testing
  modes = "create|read"
  if len(sys.argv) < 2:
    err("usage: %s %s ..."%(sys.argv[0],modes))
  mode=sys.argv[1]
  if mode == 'create':
    if len(sys.argv) < 8:
      print("usage: %s create filename fields interval num start stop"%sys.argv[0])
      sys.exit(1)
    fn=sys.argv[2]
    fields=sys.argv[3].split(",")
    iv=int(sys.argv[4])
    num=int(sys.argv[5])
    start=float(sys.argv[6])
    stop=float(sys.argv[7])
    rnd=(stop-start)/30.0
    incr=(stop-start)/float(num)
    now=time.time()
    starttime=now-iv*num
    wr=HistoryFileWriter(fn,fields)
    for i in range(0,num):
      record=[starttime]
      for f in fields:
        v=(-0.5 + random.random())*rnd+start
        record.append(v)
      wr.writeRecord(REC_DATA,record)
      start+=incr
      starttime+=iv

    wr.close()
    sys.exit(0)

  if mode == 'read':
    if len(sys.argv) < 4:
      print("usage: %s filename fields"%sys.argv[0])
      sys.exit(1)
    fn=sys.argv[2]
    fields=sys.argv[3].split(",")
    rd=HistoryFileReader(fn,fields)
    if not rd.isOpen():
      err("file %s not found"%fn)
    values=[]
    values.extend(rd.getRecords())
    for r in values:
      print("#%d:%s"%(r[0],",".join(map(lambda a: str(a),r[1:]))))

    sys.exit(0)

  print("invalid mode %s"%mode)
  sys.exit(1)
