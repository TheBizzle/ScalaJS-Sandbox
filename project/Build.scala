import sbt._
import Keys._
import play.Project._

object ApplicationBuild extends Build {

  val appName    = "ScalaJS-Sandbox"
  val appVersion = "1.0-SNAPSHOT"

  val appDependencies = Seq(
    jdbc,
    anorm
  )

  val main = play.Project(appName, appVersion, appDependencies).settings(
    ScalaJS.scalaJSSettings: _*
  )

}
