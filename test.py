#! /usr/bin/env python

from plugin import *
import random

def err(text):
  print("ERROR: %s"%text)
  sys.exit(1)


def dtToTs(dt):
  DAY = 24 * 60 * 60  # POSIX day in seconds (exact value)
  timestamp = (dt.toordinal() - datetime.datetime(1970, 1, 1).toordinal()) * DAY
  timestamp = (dt - datetime.datetime(1970, 1, 1)).days * DAY
  return timestamp

if __name__ == '__main__':
  #testing
  modes = "create|read"
  if len(sys.argv) < 2:
    err("usage: %s %s ..."%(sys.argv[0],modes))
  mode=sys.argv[1]
  if mode == 'create':
    if len(sys.argv) < 7:
      print("usage: %s create yyyy-mm-dd fields interval start stop"%sys.argv[0])
      sys.exit(1)
    fn=sys.argv[2]+".avh"
    parts=sys.argv[2].split("-")
    if len(parts) != 3:
      err("you must provide yyyy-mm-dd for the date")
    dt=datetime.datetime(year=int(parts[0]),month=int(parts[1]),day=int(parts[2]))
    ts=dtToTs(dt)
    fields=sys.argv[3].split(",")
    iv=int(sys.argv[4])
    num=24*3600/iv
    start=float(sys.argv[5])
    stop=float(sys.argv[6])
    rnd=(stop-start)/30.0
    incr=(stop-start)/float(num)
    starttime=ts
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
